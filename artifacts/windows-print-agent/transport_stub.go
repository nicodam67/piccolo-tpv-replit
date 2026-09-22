//go:build !windows

package main

import (
	"context"
	"errors"
)

type windowsRawTransport struct{}

func (windowsRawTransport) Print(
	context.Context,
	PrinterConfig,
	[]byte,
	int,
) (string, error) {
	return "", &PrintFailure{Err: errors.New("Windows RAW spooler solo está disponible en Windows")}
}
