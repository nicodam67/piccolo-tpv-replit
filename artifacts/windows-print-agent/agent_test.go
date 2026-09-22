package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

const (
	testPrinterID = "123e4567-e89b-42d3-a456-426614174000"
	testToken     = "0123456789abcdef0123456789abcdef"
)

type fakeTransport struct {
	mu       sync.Mutex
	calls    int
	payload  []byte
	copies   int
	failures []error
	level    string
}

func (f *fakeTransport) Print(
	_ context.Context,
	_ PrinterConfig,
	payload []byte,
	copies int,
) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	f.payload = append([]byte(nil), payload...)
	f.copies = copies
	if len(f.failures) > 0 {
		err := f.failures[0]
		f.failures = f.failures[1:]
		return "", err
	}
	if f.level == "" {
		return "spooler", nil
	}
	return f.level, nil
}

func testConfig() Config {
	cfg := defaultConfig()
	cfg.Printers = []PrinterConfig{{
		ID: testPrinterID, Name: "Cocina", Enabled: true,
		Target: TargetConfig{Type: "tcp", Address: "127.0.0.1:9100"},
	}}
	return cfg
}

func newTestAgent(t *testing.T, storePath string, transport PrinterTransport) *Agent {
	t.Helper()
	store, err := OpenReceiptStore(storePath, 24*time.Hour, 100)
	if err != nil {
		t.Fatal(err)
	}
	agent, err := NewAgent(testConfig(), []byte(testToken), store, transport, log.New(io.Discard, "", 0))
	if err != nil {
		t.Fatal(err)
	}
	return agent
}

func printHTTP(
	t *testing.T,
	handler http.Handler,
	key string,
	body string,
	token string,
) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(http.MethodPost, "/v1/print", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	if key != "" {
		request.Header.Set("Idempotency-Key", key)
	}
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func validBody(payload []byte, copies int) string {
	body, _ := json.Marshal(printRequest{
		PrinterID: testPrinterID, PayloadBase64: base64.StdEncoding.EncodeToString(payload), Copies: copies,
	})
	return string(body)
}

func decodePrintResponse(t *testing.T, recorder *httptest.ResponseRecorder) printResponse {
	t.Helper()
	var response printResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	return response
}

func TestAuthenticationAndHealth(t *testing.T) {
	agent := newTestAgent(t, filepath.Join(t.TempDir(), "receipts.json"), &fakeTransport{})
	for name, testCase := range map[string]struct {
		token string
		want  int
	}{
		"missing": {"", http.StatusUnauthorized},
		"wrong":   {testToken + "x", http.StatusUnauthorized},
		"valid":   {testToken, http.StatusOK},
	} {
		t.Run(name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, "/health", nil)
			if testCase.token != "" {
				request.Header.Set("Authorization", "Bearer "+testCase.token)
			}
			response := httptest.NewRecorder()
			agent.APIHandler().ServeHTTP(response, request)
			if response.Code != testCase.want {
				t.Fatalf("got %d body=%s, want %d", response.Code, response.Body, testCase.want)
			}
		})
	}
}

func TestPrintContractPreservesPayloadAndCopies(t *testing.T) {
	transport := &fakeTransport{level: "device"}
	agent := newTestAgent(t, filepath.Join(t.TempDir(), "receipts.json"), transport)
	payload := []byte{0x1b, 0x40, 0x00, 0xff, 0x1d, 0x56, 0x00}
	response := printHTTP(t, agent.APIHandler(), "job-1", validBody(payload, 3), testToken)
	if response.Code != http.StatusOK {
		t.Fatalf("got %d: %s", response.Code, response.Body)
	}
	got := decodePrintResponse(t, response)
	if !got.Accepted || got.ConfirmationLevel != "device" || got.Error != "" {
		t.Fatalf("unexpected response: %+v", got)
	}
	if !bytes.Equal(transport.payload, payload) || transport.copies != 3 {
		t.Fatalf("transport got payload=%x copies=%d", transport.payload, transport.copies)
	}
}

func TestBadPayloads(t *testing.T) {
	cases := map[string]struct {
		key  string
		body string
	}{
		"invalid json":  {"key", "{"},
		"missing key":   {"", validBody([]byte("x"), 1)},
		"bad uuid":      {"key", `{"printerId":"x","payloadBase64":"eA==","copies":1}`},
		"bad base64":    {"key", `{"printerId":"` + testPrinterID + `","payloadBase64":"***","copies":1}`},
		"empty payload": {"key", `{"printerId":"` + testPrinterID + `","payloadBase64":"","copies":1}`},
		"zero copies":   {"key", validBody([]byte("x"), 0)},
		"many copies":   {"key", validBody([]byte("x"), 11)},
		"unknown field": {"key", `{"printerId":"` + testPrinterID + `","payloadBase64":"eA==","copies":1,"extra":1}`},
		"trailing json": {"key", validBody([]byte("x"), 1) + `{}`},
	}
	for name, item := range cases {
		t.Run(name, func(t *testing.T) {
			agent := newTestAgent(t, filepath.Join(t.TempDir(), "receipts.json"), &fakeTransport{})
			response := printHTTP(t, agent.APIHandler(), item.key, item.body, testToken)
			if response.Code != http.StatusBadRequest {
				t.Fatalf("got %d: %s", response.Code, response.Body)
			}
		})
	}
}

func TestUnknownAndDisabledPrinter(t *testing.T) {
	agent := newTestAgent(t, filepath.Join(t.TempDir(), "receipts.json"), &fakeTransport{})
	body := `{"printerId":"223e4567-e89b-42d3-a456-426614174000","payloadBase64":"eA==","copies":1}`
	response := printHTTP(t, agent.APIHandler(), "unknown", body, testToken)
	if response.Code != http.StatusNotFound {
		t.Fatalf("got %d: %s", response.Code, response.Body)
	}
}

func TestIdempotentReplayAndConflict(t *testing.T) {
	transport := &fakeTransport{}
	agent := newTestAgent(t, filepath.Join(t.TempDir(), "receipts.json"), transport)
	first := printHTTP(t, agent.APIHandler(), "same-key", validBody([]byte("one"), 1), testToken)
	replay := printHTTP(t, agent.APIHandler(), "same-key", validBody([]byte("one"), 1), testToken)
	conflict := printHTTP(t, agent.APIHandler(), "same-key", validBody([]byte("two"), 1), testToken)
	if first.Code != http.StatusOK || replay.Code != http.StatusOK || conflict.Code != http.StatusConflict {
		t.Fatalf("codes first=%d replay=%d conflict=%d", first.Code, replay.Code, conflict.Code)
	}
	if transport.calls != 1 {
		t.Fatalf("transport called %d times", transport.calls)
	}
	if !decodePrintResponse(t, replay).Accepted {
		t.Fatal("replay was not accepted")
	}
}

func TestCrashAmbiguitySurvivesStoreReload(t *testing.T) {
	path := filepath.Join(t.TempDir(), "receipts.json")
	store, err := OpenReceiptStore(path, 24*time.Hour, 100)
	if err != nil {
		t.Fatal(err)
	}
	request := printRequest{PrinterID: testPrinterID, Copies: 1}
	payload := []byte("possibly sent")
	if status, _, err := store.Begin("crash-key", requestHash(request, payload)); err != nil || status != BeginNew {
		t.Fatalf("begin status=%v err=%v", status, err)
	}
	transport := &fakeTransport{}
	agent := newTestAgent(t, path, transport)
	response := printHTTP(t, agent.APIHandler(), "crash-key", validBody(payload, 1), testToken)
	if response.Code != http.StatusConflict || !strings.Contains(response.Body.String(), "ambiguo") {
		t.Fatalf("got %d: %s", response.Code, response.Body)
	}
	if transport.calls != 0 {
		t.Fatal("ambiguous job was reprinted")
	}
}

func TestKnownFailureIsRetryable(t *testing.T) {
	transport := &fakeTransport{failures: []error{
		&PrintFailure{Err: errors.New("connection refused"), Ambiguous: false},
	}}
	agent := newTestAgent(t, filepath.Join(t.TempDir(), "receipts.json"), transport)
	body := validBody([]byte("retry"), 1)
	first := printHTTP(t, agent.APIHandler(), "retry-key", body, testToken)
	second := printHTTP(t, agent.APIHandler(), "retry-key", body, testToken)
	if first.Code != http.StatusServiceUnavailable || second.Code != http.StatusOK {
		t.Fatalf("codes first=%d second=%d, bodies=%s / %s", first.Code, second.Code, first.Body, second.Body)
	}
	if transport.calls != 2 {
		t.Fatalf("transport called %d times", transport.calls)
	}
}

func TestTCPFakeListener(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	received := make(chan []byte, 1)
	go func() {
		connection, err := listener.Accept()
		if err != nil {
			return
		}
		defer connection.Close()
		data, _ := io.ReadAll(connection)
		received <- data
	}()
	payload := []byte{0x1b, 0x40, 'X', '\n'}
	level, err := printTCP(context.Background(), listener.Addr().String(), payload, 2, time.Second)
	if err != nil || level != "transport" {
		t.Fatalf("level=%s err=%v", level, err)
	}
	select {
	case got := <-received:
		if !bytes.Equal(got, append(append([]byte{}, payload...), payload...)) {
			t.Fatalf("got %x", got)
		}
	case <-time.After(time.Second):
		t.Fatal("listener did not receive payload")
	}
}

func TestConfigSecurityValidation(t *testing.T) {
	cases := map[string]Config{}
	nonTLS := testConfig()
	nonTLS.ListenAddress = "0.0.0.0:17321"
	cases["non-loopback without TLS"] = nonTLS
	remoteDiagnostics := testConfig()
	remoteDiagnostics.DiagnosticsAddress = "0.0.0.0:17322"
	cases["remote diagnostics"] = remoteDiagnostics
	badTarget := testConfig()
	badTarget.Printers[0].Target = TargetConfig{Type: "windows_raw"}
	cases["missing queue"] = badTarget
	for name, cfg := range cases {
		t.Run(name, func(t *testing.T) {
			if err := cfg.Validate(); err == nil {
				t.Fatal("expected validation failure")
			}
		})
	}
	valid := testConfig()
	valid.ListenAddress = "0.0.0.0:17321"
	valid.TLS = TLSConfig{CertFile: "cert.pem", KeyFile: "key.pem"}
	if err := valid.Validate(); err != nil {
		t.Fatal(err)
	}
}

func TestDiagnosticsAndTestPrint(t *testing.T) {
	transport := &fakeTransport{}
	agent := newTestAgent(t, filepath.Join(t.TempDir(), "receipts.json"), transport)
	statusRequest := httptest.NewRequest(http.MethodGet, "/api/status", nil)
	statusRequest.RemoteAddr = "127.0.0.1:12345"
	statusResponse := httptest.NewRecorder()
	agent.DiagnosticsHandler().ServeHTTP(statusResponse, statusRequest)
	if statusResponse.Code != http.StatusOK || !strings.Contains(statusResponse.Body.String(), testPrinterID) {
		t.Fatalf("status=%d body=%s", statusResponse.Code, statusResponse.Body)
	}
	testRequest := httptest.NewRequest(
		http.MethodPost, "/api/test-print", strings.NewReader(`{"printerId":"`+testPrinterID+`"}`),
	)
	testRequest.RemoteAddr = "[::1]:12345"
	testRequest.Header.Set("Content-Type", "application/json")
	testRequest.Header.Set("X-Piccolo-Diagnostics", "1")
	testResponse := httptest.NewRecorder()
	agent.DiagnosticsHandler().ServeHTTP(testResponse, testRequest)
	if testResponse.Code != http.StatusOK || transport.calls != 1 {
		t.Fatalf("status=%d calls=%d body=%s", testResponse.Code, transport.calls, testResponse.Body)
	}
	remoteRequest := httptest.NewRequest(http.MethodGet, "/api/status", nil)
	remoteRequest.RemoteAddr = "192.0.2.1:12345"
	remoteResponse := httptest.NewRecorder()
	agent.DiagnosticsHandler().ServeHTTP(remoteResponse, remoteRequest)
	if remoteResponse.Code != http.StatusForbidden {
		t.Fatalf("remote diagnostics got %d", remoteResponse.Code)
	}
}
