//go:build !windows

package main

import "errors"

func saveProtectedToken(string, []byte) error {
	return errors.New("DPAPI LocalMachine solo está disponible en Windows")
}

func loadProtectedToken(string) ([]byte, error) {
	return nil, errors.New("DPAPI LocalMachine solo está disponible en Windows")
}

func secureDataDirectory(string) error {
	return nil
}
