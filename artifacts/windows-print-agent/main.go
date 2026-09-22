package main

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

var (
	version = "0.1.0"
	commit  = "dev"
)

type runOptions struct {
	dataDir    string
	configPath string
}

func main() {
	if err := execute(os.Args[1:], os.Stdin, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func execute(args []string, input io.Reader, output io.Writer) error {
	command := "run"
	if len(args) > 0 {
		command = args[0]
		args = args[1:]
	}
	switch command {
	case "run":
		options, err := parseRunOptions(args)
		if err != nil {
			return err
		}
		if handled, err := maybeRunAsWindowsService(options); handled {
			return err
		}
		ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
		defer stop()
		return runAgent(ctx, options)
	case "configure":
		flags := flag.NewFlagSet("configure", flag.ContinueOnError)
		flags.SetOutput(output)
		dataDir := flags.String("data-dir", defaultDataDir(), "directorio de datos")
		if err := flags.Parse(args); err != nil {
			return err
		}
		return configureInteractive(input, output, *dataDir)
	case "generate-token":
		token, err := generateToken()
		if err != nil {
			return err
		}
		fmt.Fprintln(output, token)
		return nil
	case "validate":
		options, err := parseRunOptions(args)
		if err != nil {
			return err
		}
		if err := validateInstallation(options); err != nil {
			return err
		}
		fmt.Fprintln(output, "Configuración, TLS, token DPAPI y destinos válidos.")
		return nil
	case "diagnostics":
		url := "http://" + defaultDiagnosticsAddress + "/"
		if err := openDiagnostics(url); err != nil {
			fmt.Fprintln(output, url)
			return err
		}
		return nil
	case "version", "--version", "-version":
		fmt.Fprintf(output, "Piccolo Print Agent %s (%s)\n", version, commit)
		return nil
	default:
		return fmt.Errorf("comando desconocido %q (use configure, generate-token, validate, run, diagnostics o version)", command)
	}
}

func parseRunOptions(args []string) (runOptions, error) {
	flags := flag.NewFlagSet("run", flag.ContinueOnError)
	dataDir := flags.String("data-dir", defaultDataDir(), "directorio de datos")
	configPath := flags.String("config", "", "ruta de config.json")
	if err := flags.Parse(args); err != nil {
		return runOptions{}, err
	}
	if *configPath == "" {
		*configPath = filepath.Join(*dataDir, "config.json")
	}
	return runOptions{dataDir: *dataDir, configPath: *configPath}, nil
}

func validateInstallation(options runOptions) error {
	cfg, err := loadConfig(options.configPath)
	if err != nil {
		return err
	}
	if _, err := loadProtectedToken(filepath.Join(options.dataDir, "token.dpapi")); err != nil {
		return err
	}
	if cfg.TLS.CertFile != "" {
		if _, err := os.Stat(cfg.TLS.CertFile); err != nil {
			return fmt.Errorf("certificado TLS: %w", err)
		}
		if _, err := os.Stat(cfg.TLS.KeyFile); err != nil {
			return fmt.Errorf("clave TLS: %w", err)
		}
	}
	return nil
}

func runAgent(ctx context.Context, options runOptions) (result error) {
	if err := secureDataDirectory(options.dataDir); err != nil {
		return err
	}
	logger, closeLog, err := openAgentLog(options.dataDir)
	if err != nil {
		return err
	}
	defer closeLog()
	defer func() {
		if result != nil {
			logger.Printf("agent stopped error=%q", result)
		}
	}()
	cfg, err := loadConfig(options.configPath)
	if err != nil {
		return err
	}
	token, err := loadProtectedToken(filepath.Join(options.dataDir, "token.dpapi"))
	if err != nil {
		return err
	}
	store, err := OpenReceiptStore(
		filepath.Join(options.dataDir, "receipts.json"),
		time.Duration(cfg.ReceiptRetentionH)*time.Hour,
		cfg.MaxReceipts,
	)
	if err != nil {
		return err
	}
	agent, err := NewAgent(
		cfg, token, store,
		newTransportRouter(time.Duration(cfg.TCPTimeoutMS)*time.Millisecond),
		logger,
	)
	if err != nil {
		return err
	}
	apiListener, err := net.Listen("tcp", cfg.ListenAddress)
	if err != nil {
		return fmt.Errorf("escuchar API: %w", err)
	}
	diagnosticsListener, err := net.Listen("tcp", cfg.DiagnosticsAddress)
	if err != nil {
		apiListener.Close()
		return fmt.Errorf("escuchar diagnóstico: %w", err)
	}
	apiServer := &http.Server{
		Handler: agent.APIHandler(), ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout: 10 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second,
	}
	diagnosticsServer := &http.Server{
		Handler: agent.DiagnosticsHandler(), ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout: 10 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 30 * time.Second,
	}
	serverErrors := make(chan error, 2)
	go func() {
		logger.Printf("API listening address=%s tls=%t", cfg.ListenAddress, cfg.TLS.CertFile != "")
		var serveErr error
		if cfg.TLS.CertFile != "" {
			serveErr = apiServer.ServeTLS(apiListener, cfg.TLS.CertFile, cfg.TLS.KeyFile)
		} else {
			serveErr = apiServer.Serve(apiListener)
		}
		serverErrors <- serveErr
	}()
	go func() {
		logger.Printf("diagnostics listening address=%s", cfg.DiagnosticsAddress)
		serverErrors <- diagnosticsServer.Serve(diagnosticsListener)
	}()

	var serverResult error
	select {
	case <-ctx.Done():
		logger.Printf("shutdown requested")
	case serverResult = <-serverErrors:
		if !errors.Is(serverResult, http.ErrServerClosed) {
			logger.Printf("server stopped unexpectedly: %v", serverResult)
		} else {
			serverResult = nil
		}
	}
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	apiErr := apiServer.Shutdown(shutdownCtx)
	diagnosticsErr := diagnosticsServer.Shutdown(shutdownCtx)
	if serverResult != nil {
		return serverResult
	}
	return errors.Join(apiErr, diagnosticsErr)
}

func openAgentLog(dataDir string) (*log.Logger, func(), error) {
	path := filepath.Join(dataDir, "agent.log")
	if info, err := os.Stat(path); err == nil && info.Size() > 10<<20 {
		_ = os.Remove(path + ".1")
		_ = os.Rename(path, path+".1")
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, nil, fmt.Errorf("abrir log: %w", err)
	}
	return log.New(file, "", log.Ldate|log.Ltime|log.LUTC), func() { _ = file.Close() }, nil
}

func generateToken() (string, error) {
	random := make([]byte, 32)
	if _, err := rand.Read(random); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(random), nil
}

func configureInteractive(input io.Reader, output io.Writer, dataDir string) error {
	if err := secureDataDirectory(dataDir); err != nil {
		return err
	}
	reader := bufio.NewReader(input)
	cfg := defaultConfig()
	fmt.Fprintln(output, "Piccolo Print Agent — configuración local")
	cfg.ListenAddress = prompt(reader, output, "Dirección API", cfg.ListenAddress)
	cfg.DiagnosticsAddress = prompt(reader, output, "Dirección diagnóstico (solo loopback)", cfg.DiagnosticsAddress)
	if !isLoopbackAddress(cfg.ListenAddress) {
		cfg.TLS.CertFile = prompt(reader, output, "Ruta certificado TLS", "")
		cfg.TLS.KeyFile = prompt(reader, output, "Ruta clave TLS", "")
	}
	countText := prompt(reader, output, "Número de impresoras", "1")
	count, err := strconv.Atoi(countText)
	if err != nil || count < 0 || count > 100 {
		return errors.New("número de impresoras inválido")
	}
	for index := 0; index < count; index++ {
		fmt.Fprintf(output, "\nImpresora %d\n", index+1)
		printer := PrinterConfig{
			ID:      prompt(reader, output, "UUID lógico", ""),
			Name:    prompt(reader, output, "Nombre", ""),
			Enabled: strings.EqualFold(prompt(reader, output, "Habilitada (s/n)", "s"), "s"),
		}
		printer.Target.Type = prompt(reader, output, "Target (tcp/windows_raw)", "tcp")
		if printer.Target.Type == "tcp" {
			printer.Target.Address = prompt(reader, output, "Dirección host:puerto", "")
		} else {
			printer.Target.QueueName = prompt(reader, output, "Nombre exacto de cola Windows", "")
		}
		cfg.Printers = append(cfg.Printers, printer)
	}
	if err := cfg.Validate(); err != nil {
		return err
	}
	token := prompt(reader, output, "PRINT_AGENT_TOKEN (vacío para generar)", "")
	if token == "" {
		token, err = generateToken()
		if err != nil {
			return err
		}
		fmt.Fprintf(output, "\nGuarde este token en el servidor como PRINT_AGENT_TOKEN (se muestra una sola vez):\n%s\n", token)
	}
	if len(token) < 32 {
		return errors.New("PRINT_AGENT_TOKEN debe tener al menos 32 caracteres")
	}
	configData, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	configData = append(configData, '\n')
	if err := atomicWriteFile(filepath.Join(dataDir, "config.json"), configData, 0o600); err != nil {
		return err
	}
	if err := saveProtectedToken(filepath.Join(dataDir, "token.dpapi"), []byte(token)); err != nil {
		return err
	}
	fmt.Fprintf(output, "Configuración guardada en %s. El token solo se persiste cifrado con DPAPI LocalMachine.\n", dataDir)
	return nil
}

func prompt(reader *bufio.Reader, output io.Writer, label, defaultValue string) string {
	if defaultValue == "" {
		fmt.Fprintf(output, "%s: ", label)
	} else {
		fmt.Fprintf(output, "%s [%s]: ", label, defaultValue)
	}
	value, _ := reader.ReadString('\n')
	value = strings.TrimSpace(value)
	if value == "" {
		return defaultValue
	}
	return value
}
