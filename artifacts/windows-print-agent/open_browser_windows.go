//go:build windows

package main

import (
	"fmt"
	"os/exec"
)

func openDiagnostics(url string) error {
	if err := exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start(); err != nil {
		return fmt.Errorf("abrir diagnóstico: %w", err)
	}
	return nil
}
