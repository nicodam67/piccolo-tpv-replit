package main

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

const maxPrintBodyBytes = 2 << 20

type printRequest struct {
	PrinterID     string `json:"printerId"`
	PayloadBase64 string `json:"payloadBase64"`
	Copies        int    `json:"copies"`
}

type printResponse struct {
	Accepted          bool   `json:"accepted"`
	ConfirmationLevel string `json:"confirmationLevel"`
	Error             string `json:"error"`
}

type runtimeStatus struct {
	mu                sync.RWMutex
	startedAt         time.Time
	lastCommunication time.Time
	lastServer        string
	lastJob           time.Time
	lastError         string
}

type Agent struct {
	config     Config
	token      []byte
	store      *ReceiptStore
	transport  PrinterTransport
	logger     *log.Logger
	status     runtimeStatus
	printerMap map[string]PrinterConfig
}

func NewAgent(
	config Config,
	token []byte,
	store *ReceiptStore,
	transport PrinterTransport,
	logger *log.Logger,
) (*Agent, error) {
	config.applyDefaults()
	if err := config.Validate(); err != nil {
		return nil, err
	}
	if len(token) < 32 {
		return nil, errors.New("PRINT_AGENT_TOKEN debe tener al menos 32 bytes")
	}
	if store == nil || transport == nil || logger == nil {
		return nil, errors.New("store, transport y logger son obligatorios")
	}
	printers := make(map[string]PrinterConfig, len(config.Printers))
	for _, printer := range config.Printers {
		printers[strings.ToLower(printer.ID)] = printer
	}
	return &Agent{
		config: config, token: append([]byte(nil), token...), store: store,
		transport: transport, logger: logger, printerMap: printers,
		status: runtimeStatus{startedAt: time.Now().UTC()},
	}, nil
}

func (a *Agent) APIHandler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", a.authenticate(a.handleHealth))
	mux.HandleFunc("POST /v1/print", a.authenticate(a.handlePrint))
	return securityHeaders(mux)
}

func (a *Agent) authenticate(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		provided := []byte("")
		if strings.HasPrefix(header, "Bearer ") {
			provided = []byte(strings.TrimPrefix(header, "Bearer "))
		}
		valid := subtle.ConstantTimeCompare(provided, a.token)
		if valid != 1 {
			writePrintJSON(w, http.StatusUnauthorized, printResponse{
				Accepted: false, ConfirmationLevel: "spooler", Error: "unauthorized",
			})
			return
		}
		a.status.mu.Lock()
		a.status.lastCommunication = time.Now().UTC()
		a.status.lastServer = remoteHost(r.RemoteAddr)
		a.status.mu.Unlock()
		next(w, r)
	}
}

func (a *Agent) handleHealth(w http.ResponseWriter, _ *http.Request) {
	receipts := a.store.Snapshot()
	inProgress := 0
	for _, receipt := range receipts {
		if receipt.State == "in_progress" {
			inProgress++
		}
	}
	enabled := 0
	for _, printer := range a.config.Printers {
		if printer.Enabled {
			enabled++
		}
	}
	status := "ok"
	code := http.StatusOK
	if enabled == 0 || inProgress > 0 {
		status = "degraded"
		code = http.StatusServiceUnavailable
	}
	a.status.mu.RLock()
	body := map[string]any{
		"status":                 status,
		"version":                version,
		"enabledPrinters":        enabled,
		"ambiguousReceipts":      inProgress,
		"physicalStatusVerified": false,
		"startedAt":              a.status.startedAt,
		"lastCommunication":      timeOrNil(a.status.lastCommunication),
		"lastAuthorizedServer":   a.status.lastServer,
		"lastJob":                timeOrNil(a.status.lastJob),
		"lastError":              a.status.lastError,
	}
	a.status.mu.RUnlock()
	writeJSON(w, code, body)
}

func (a *Agent) handlePrint(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxPrintBodyBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var request printRequest
	if err := decoder.Decode(&request); err != nil {
		a.writeJobError(w, http.StatusBadRequest, "payload JSON inválido")
		return
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		a.writeJobError(w, http.StatusBadRequest, "solo se permite un objeto JSON")
		return
	}
	key := r.Header.Get("Idempotency-Key")
	if len(key) < 1 || len(key) > 200 || strings.TrimSpace(key) != key {
		a.writeJobError(w, http.StatusBadRequest, "Idempotency-Key obligatorio e inválido")
		return
	}
	if !uuidPattern.MatchString(request.PrinterID) {
		a.writeJobError(w, http.StatusBadRequest, "printerId debe ser un UUID")
		return
	}
	if request.Copies < 1 || request.Copies > 10 {
		a.writeJobError(w, http.StatusBadRequest, "copies debe estar entre 1 y 10")
		return
	}
	payload, err := base64.StdEncoding.Strict().DecodeString(request.PayloadBase64)
	if err != nil || len(payload) == 0 {
		a.writeJobError(w, http.StatusBadRequest, "payloadBase64 debe contener Base64 válido no vacío")
		return
	}
	printer, ok := a.printerMap[strings.ToLower(request.PrinterID)]
	if !ok || !printer.Enabled {
		a.writeJobError(w, http.StatusNotFound, "impresora desconocida o deshabilitada")
		return
	}
	hash := requestHash(request, payload)
	begin, receipt, err := a.store.Begin(key, hash)
	if err != nil {
		a.writeJobError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	switch begin {
	case BeginConflict:
		a.writeJobError(w, http.StatusConflict, "Idempotency-Key ya usado con payload distinto")
		return
	case BeginAmbiguous:
		a.writeJobError(w, http.StatusConflict, "resultado ambiguo: envío anterior in_progress; no se reimprime")
		return
	case BeginReplay:
		writePrintJSON(w, http.StatusOK, printResponse{
			Accepted: true, ConfirmationLevel: receipt.ConfirmationLevel, Error: "",
		})
		return
	}

	level, printErr := a.transport.Print(r.Context(), printer, payload, request.Copies)
	if printErr != nil {
		var failure *PrintFailure
		known := errors.As(printErr, &failure) && !failure.Ambiguous
		if known {
			if err := a.store.KnownFailure(key, hash); err != nil {
				a.writeJobError(w, http.StatusConflict, "fallo conocido, pero no se pudo confirmar la liberación del recibo; resultado ambiguo")
				return
			}
			a.writeJobError(w, http.StatusServiceUnavailable, printErr.Error())
			return
		}
		a.writeJobError(w, http.StatusConflict, "resultado ambiguo durante el envío; no se reimprime: "+printErr.Error())
		return
	}
	if level != "transport" && level != "spooler" && level != "device" {
		a.writeJobError(w, http.StatusInternalServerError, "transporte devolvió confirmationLevel inválido")
		return
	}
	if _, err := a.store.Complete(key, hash, level); err != nil {
		a.writeJobError(w, http.StatusConflict, "envío aceptado, pero el recibo no pudo completarse; resultado ambiguo")
		return
	}
	a.status.mu.Lock()
	a.status.lastJob = time.Now().UTC()
	a.status.lastError = ""
	a.status.mu.Unlock()
	a.logger.Printf("print accepted printer=%s keyHash=%s confirmation=%s copies=%d",
		printer.ID, shortHash(key), level, request.Copies)
	writePrintJSON(w, http.StatusOK, printResponse{
		Accepted: true, ConfirmationLevel: level, Error: "",
	})
}

func (a *Agent) writeJobError(w http.ResponseWriter, status int, message string) {
	a.status.mu.Lock()
	a.status.lastError = message
	a.status.mu.Unlock()
	a.logger.Printf("request rejected status=%d error=%q", status, message)
	writePrintJSON(w, status, printResponse{
		Accepted: false, ConfirmationLevel: "spooler", Error: message,
	})
}

func requestHash(request printRequest, payload []byte) string {
	hash := sha256.New()
	hash.Write([]byte(strings.ToLower(request.PrinterID)))
	hash.Write([]byte{0, byte(request.Copies)})
	hash.Write(payload)
	return hex.EncodeToString(hash.Sum(nil))
}

func shortHash(value string) string {
	hash := sha256.Sum256([]byte(value))
	return hex.EncodeToString(hash[:6])
}

func writePrintJSON(w http.ResponseWriter, status int, body printResponse) {
	writeJSON(w, status, body)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		next.ServeHTTP(w, r)
	})
}

func timeOrNil(value time.Time) any {
	if value.IsZero() {
		return nil
	}
	return value
}

func remoteIsLoopback(remoteAddress string) bool {
	host, _, err := net.SplitHostPort(remoteAddress)
	if err != nil {
		return false
	}
	ip := net.ParseIP(strings.Trim(host, "[]"))
	return ip != nil && ip.IsLoopback()
}

func remoteHost(remoteAddress string) string {
	host, _, err := net.SplitHostPort(remoteAddress)
	if err != nil {
		return "desconocido"
	}
	return strings.Trim(host, "[]")
}
