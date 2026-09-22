//go:build !windows

package main

import "fmt"

func openDiagnostics(url string) error {
	return fmt.Errorf("abra manualmente %s", url)
}
