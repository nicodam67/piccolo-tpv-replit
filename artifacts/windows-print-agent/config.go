package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"
)

const (
	defaultListenAddress      = "127.0.0.1:17321"
	defaultDiagnosticsAddress = "127.0.0.1:17322"
	defaultRetention          = 7 * 24 * time.Hour
	defaultMaxReceipts        = 10_000
	defaultTCPTimeout         = 5 * time.Second
)

var uuidPattern = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

type TLSConfig struct {
	CertFile string `json:"certFile,omitempty"`
	KeyFile  string `json:"keyFile,omitempty"`
}

type TargetConfig struct {
	Type      string `json:"type"`
	Address   string `json:"address,omitempty"`
	QueueName string `json:"queueName,omitempty"`
}

type PrinterConfig struct {
	ID      string       `json:"id"`
	Name    string       `json:"name,omitempty"`
	Enabled bool         `json:"enabled"`
	Target  TargetConfig `json:"target"`
}

type Config struct {
	ListenAddress      string          `json:"listenAddress"`
	DiagnosticsAddress string          `json:"diagnosticsAddress"`
	TLS                TLSConfig       `json:"tls,omitempty"`
	Printers           []PrinterConfig `json:"printers"`
	ReceiptRetentionH  int             `json:"receiptRetentionHours,omitempty"`
	MaxReceipts        int             `json:"maxReceipts,omitempty"`
	TCPTimeoutMS       int             `json:"tcpTimeoutMillis,omitempty"`
}

func defaultConfig() Config {
	return Config{
		ListenAddress:      defaultListenAddress,
		DiagnosticsAddress: defaultDiagnosticsAddress,
		Printers:           []PrinterConfig{},
		ReceiptRetentionH:  int(defaultRetention.Hours()),
		MaxReceipts:        defaultMaxReceipts,
		TCPTimeoutMS:       int(defaultTCPTimeout.Milliseconds()),
	}
}

func defaultDataDir() string {
	if root := os.Getenv("PROGRAMDATA"); root != "" {
		return filepath.Join(root, "Piccolo", "PrintAgent")
	}
	if runtime.GOOS == "windows" {
		return filepath.Join(`C:\ProgramData`, "Piccolo", "PrintAgent")
	}
	return filepath.Join(os.TempDir(), "Piccolo", "PrintAgent")
}

func loadConfig(path string) (Config, error) {
	file, err := os.Open(path)
	if err != nil {
		return Config{}, fmt.Errorf("abrir configuración: %w", err)
	}
	defer file.Close()
	var cfg Config
	decoder := json.NewDecoder(file)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&cfg); err != nil {
		return Config{}, fmt.Errorf("leer configuración: %w", err)
	}
	cfg.applyDefaults()
	if err := cfg.Validate(); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

func (c *Config) applyDefaults() {
	if c.ListenAddress == "" {
		c.ListenAddress = defaultListenAddress
	}
	if c.DiagnosticsAddress == "" {
		c.DiagnosticsAddress = defaultDiagnosticsAddress
	}
	if c.ReceiptRetentionH == 0 {
		c.ReceiptRetentionH = int(defaultRetention.Hours())
	}
	if c.MaxReceipts == 0 {
		c.MaxReceipts = defaultMaxReceipts
	}
	if c.TCPTimeoutMS == 0 {
		c.TCPTimeoutMS = int(defaultTCPTimeout.Milliseconds())
	}
}

func (c Config) Validate() error {
	if err := validateAddress("listenAddress", c.ListenAddress); err != nil {
		return err
	}
	if err := validateAddress("diagnosticsAddress", c.DiagnosticsAddress); err != nil {
		return err
	}
	if !isLoopbackAddress(c.DiagnosticsAddress) {
		return errors.New("diagnosticsAddress debe escuchar exclusivamente en loopback")
	}
	if !isLoopbackAddress(c.ListenAddress) && (c.TLS.CertFile == "" || c.TLS.KeyFile == "") {
		return errors.New("TLS certFile y keyFile son obligatorios al escuchar fuera de loopback")
	}
	if (c.TLS.CertFile == "") != (c.TLS.KeyFile == "") {
		return errors.New("TLS certFile y keyFile deben configurarse juntos")
	}
	if c.ReceiptRetentionH < 1 || c.ReceiptRetentionH > 24*365 {
		return errors.New("receiptRetentionHours debe estar entre 1 y 8760")
	}
	if c.MaxReceipts < 1 || c.MaxReceipts > 1_000_000 {
		return errors.New("maxReceipts debe estar entre 1 y 1000000")
	}
	if c.TCPTimeoutMS < 100 || c.TCPTimeoutMS > 120_000 {
		return errors.New("tcpTimeoutMillis debe estar entre 100 y 120000")
	}
	seen := make(map[string]struct{}, len(c.Printers))
	for i, printer := range c.Printers {
		if !uuidPattern.MatchString(printer.ID) {
			return fmt.Errorf("printers[%d].id debe ser un UUID", i)
		}
		key := strings.ToLower(printer.ID)
		if _, ok := seen[key]; ok {
			return fmt.Errorf("printerId duplicado: %s", printer.ID)
		}
		seen[key] = struct{}{}
		switch printer.Target.Type {
		case "tcp":
			if printer.Target.Address == "" {
				return fmt.Errorf("impresora %s: target.address es obligatorio", printer.ID)
			}
			if _, _, err := net.SplitHostPort(printer.Target.Address); err != nil {
				return fmt.Errorf("impresora %s: address inválida: %w", printer.ID, err)
			}
			if printer.Target.QueueName != "" {
				return fmt.Errorf("impresora %s: queueName no corresponde a target tcp", printer.ID)
			}
		case "windows_raw":
			if strings.TrimSpace(printer.Target.QueueName) == "" {
				return fmt.Errorf("impresora %s: target.queueName es obligatorio", printer.ID)
			}
			if printer.Target.Address != "" {
				return fmt.Errorf("impresora %s: address no corresponde a target windows_raw", printer.ID)
			}
		default:
			return fmt.Errorf("impresora %s: target.type debe ser tcp o windows_raw", printer.ID)
		}
	}
	return nil
}

func validateAddress(name, address string) error {
	host, port, err := net.SplitHostPort(address)
	if err != nil || host == "" || port == "" {
		return fmt.Errorf("%s debe tener formato host:puerto", name)
	}
	return nil
}

func isLoopbackAddress(address string) bool {
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return false
	}
	host = strings.Trim(host, "[]")
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}
