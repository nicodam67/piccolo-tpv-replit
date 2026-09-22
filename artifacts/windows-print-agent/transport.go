package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"time"
)

type PrintFailure struct {
	Err       error
	Ambiguous bool
}

func (e *PrintFailure) Error() string { return e.Err.Error() }
func (e *PrintFailure) Unwrap() error { return e.Err }

type PrinterTransport interface {
	Print(context.Context, PrinterConfig, []byte, int) (string, error)
}

type transportRouter struct {
	tcpTimeout time.Duration
	raw        PrinterTransport
}

func newTransportRouter(timeout time.Duration) PrinterTransport {
	return &transportRouter{tcpTimeout: timeout, raw: windowsRawTransport{}}
}

func (r *transportRouter) Print(
	ctx context.Context,
	printer PrinterConfig,
	payload []byte,
	copies int,
) (string, error) {
	switch printer.Target.Type {
	case "tcp":
		return printTCP(ctx, printer.Target.Address, payload, copies, r.tcpTimeout)
	case "windows_raw":
		return r.raw.Print(ctx, printer, payload, copies)
	default:
		return "", &PrintFailure{Err: fmt.Errorf("target no soportado: %s", printer.Target.Type)}
	}
}

func printTCP(
	ctx context.Context,
	address string,
	payload []byte,
	copies int,
	timeout time.Duration,
) (string, error) {
	dialer := net.Dialer{Timeout: timeout}
	conn, err := dialer.DialContext(ctx, "tcp", address)
	if err != nil {
		return "", &PrintFailure{Err: fmt.Errorf("conectar por TCP: %w", err)}
	}
	defer conn.Close()
	deadline := time.Now().Add(timeout)
	if contextDeadline, ok := ctx.Deadline(); ok && contextDeadline.Before(deadline) {
		deadline = contextDeadline
	}
	if err := conn.SetDeadline(deadline); err != nil {
		return "", &PrintFailure{Err: fmt.Errorf("establecer timeout TCP: %w", err)}
	}
	written := 0
	for copyNumber := 0; copyNumber < copies; copyNumber++ {
		n, writeErr := writeFull(conn, payload)
		written += n
		if writeErr != nil {
			return "", &PrintFailure{
				Err:       fmt.Errorf("escribir por TCP: %w", writeErr),
				Ambiguous: written > 0,
			}
		}
	}
	// A successful socket write only confirms transport acceptance. ESC/POS over
	// raw TCP has no correlated acknowledgement that paper was produced.
	return "transport", nil
}

func writeFull(writer io.Writer, payload []byte) (int, error) {
	total := 0
	for total < len(payload) {
		n, err := writer.Write(payload[total:])
		total += n
		if err != nil {
			return total, err
		}
		if n == 0 {
			return total, errors.New("escritura TCP sin progreso")
		}
	}
	return total, nil
}
