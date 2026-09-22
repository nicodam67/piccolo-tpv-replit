package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sort"
	"sync"
	"time"
)

const receiptSchemaVersion = 1

type Receipt struct {
	Key               string    `json:"key"`
	PayloadHash       string    `json:"payloadHash"`
	State             string    `json:"state"`
	ConfirmationLevel string    `json:"confirmationLevel,omitempty"`
	CreatedAt         time.Time `json:"createdAt"`
	CompletedAt       time.Time `json:"completedAt,omitempty"`
}

type receiptFile struct {
	Version  int                `json:"version"`
	Receipts map[string]Receipt `json:"receipts"`
}

type BeginStatus int

const (
	BeginNew BeginStatus = iota
	BeginReplay
	BeginConflict
	BeginAmbiguous
)

type ReceiptStore struct {
	mu        sync.Mutex
	path      string
	retention time.Duration
	max       int
	now       func() time.Time
	receipts  map[string]Receipt
}

func OpenReceiptStore(path string, retention time.Duration, max int) (*ReceiptStore, error) {
	store := &ReceiptStore{
		path: path, retention: retention, max: max, now: time.Now,
		receipts: make(map[string]Receipt),
	}
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return store, nil
	}
	if err != nil {
		return nil, fmt.Errorf("leer ledger de recibos: %w", err)
	}
	var file receiptFile
	if err := json.Unmarshal(data, &file); err != nil {
		return nil, fmt.Errorf("ledger de recibos corrupto: %w", err)
	}
	if file.Version != receiptSchemaVersion || file.Receipts == nil {
		return nil, fmt.Errorf("versión de ledger no soportada: %d", file.Version)
	}
	for key, receipt := range file.Receipts {
		if receipt.Key != key || (receipt.State != "in_progress" && receipt.State != "completed") {
			return nil, fmt.Errorf("recibo inválido para clave %q", key)
		}
	}
	store.receipts = file.Receipts
	store.mu.Lock()
	changed := store.pruneLocked(store.now())
	if changed {
		err = store.saveLocked()
	}
	store.mu.Unlock()
	if err != nil {
		return nil, err
	}
	return store, nil
}

func (s *ReceiptStore) Begin(key, payloadHash string) (BeginStatus, Receipt, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if existing, ok := s.receipts[key]; ok {
		if existing.PayloadHash != payloadHash {
			return BeginConflict, existing, nil
		}
		if existing.State == "completed" {
			return BeginReplay, existing, nil
		}
		return BeginAmbiguous, existing, nil
	}
	s.pruneLocked(s.now())
	if len(s.receipts) >= s.max {
		return BeginNew, Receipt{}, errors.New("ledger lleno: demasiados recibos in_progress; intervención requerida")
	}
	receipt := Receipt{
		Key: key, PayloadHash: payloadHash, State: "in_progress", CreatedAt: s.now().UTC(),
	}
	s.receipts[key] = receipt
	if err := s.saveLocked(); err != nil {
		delete(s.receipts, key)
		return BeginNew, Receipt{}, err
	}
	return BeginNew, receipt, nil
}

func (s *ReceiptStore) Complete(key, payloadHash, level string) (Receipt, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	receipt, ok := s.receipts[key]
	if !ok || receipt.PayloadHash != payloadHash || receipt.State != "in_progress" {
		return Receipt{}, errors.New("el recibo in_progress esperado no existe")
	}
	receipt.State = "completed"
	receipt.ConfirmationLevel = level
	receipt.CompletedAt = s.now().UTC()
	s.receipts[key] = receipt
	if err := s.saveLocked(); err != nil {
		// Keeping the in-memory state ambiguous is safer than accepting another print.
		receipt.State = "in_progress"
		receipt.ConfirmationLevel = ""
		receipt.CompletedAt = time.Time{}
		s.receipts[key] = receipt
		return Receipt{}, err
	}
	return receipt, nil
}

func (s *ReceiptStore) KnownFailure(key, payloadHash string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	receipt, ok := s.receipts[key]
	if !ok || receipt.PayloadHash != payloadHash || receipt.State != "in_progress" {
		return errors.New("el recibo in_progress esperado no existe")
	}
	delete(s.receipts, key)
	if err := s.saveLocked(); err != nil {
		// Preserve ambiguity in memory when the durable removal cannot be proven.
		s.receipts[key] = receipt
		return err
	}
	return nil
}

func (s *ReceiptStore) Snapshot() []Receipt {
	s.mu.Lock()
	defer s.mu.Unlock()
	result := make([]Receipt, 0, len(s.receipts))
	for _, receipt := range s.receipts {
		result = append(result, receipt)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].CreatedAt.After(result[j].CreatedAt) })
	return result
}

func (s *ReceiptStore) pruneLocked(now time.Time) bool {
	changed := false
	for key, receipt := range s.receipts {
		if receipt.State == "completed" && now.Sub(receipt.CompletedAt) > s.retention {
			delete(s.receipts, key)
			changed = true
		}
	}
	if len(s.receipts) < s.max {
		return changed
	}
	completed := make([]Receipt, 0, len(s.receipts))
	for _, receipt := range s.receipts {
		if receipt.State == "completed" {
			completed = append(completed, receipt)
		}
	}
	sort.Slice(completed, func(i, j int) bool {
		return completed[i].CompletedAt.Before(completed[j].CompletedAt)
	})
	for _, receipt := range completed {
		if len(s.receipts) < s.max {
			break
		}
		delete(s.receipts, receipt.Key)
		changed = true
	}
	return changed
}

func (s *ReceiptStore) saveLocked() error {
	data, err := json.MarshalIndent(receiptFile{
		Version: receiptSchemaVersion, Receipts: s.receipts,
	}, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	return atomicWriteFile(s.path, data, 0o600)
}
