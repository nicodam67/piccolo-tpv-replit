//go:build windows

package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	cryptProtectUIForbidden  = 0x1
	cryptProtectLocalMachine = 0x4
)

var (
	crypt32                = windows.NewLazySystemDLL("crypt32.dll")
	procCryptProtectData   = crypt32.NewProc("CryptProtectData")
	procCryptUnprotectData = crypt32.NewProc("CryptUnprotectData")
	kernel32               = windows.NewLazySystemDLL("kernel32.dll")
	procLocalFree          = kernel32.NewProc("LocalFree")
	printAgentEntropy      = []byte("Piccolo Print Agent token v1")
)

type dataBlob struct {
	size uint32
	data *byte
}

func saveProtectedToken(path string, token []byte) error {
	protected, err := cryptProtect(token)
	if err != nil {
		return err
	}
	return atomicWriteFile(path, protected, 0o600)
}

func loadProtectedToken(path string) ([]byte, error) {
	protected, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("leer token DPAPI: %w", err)
	}
	token, err := cryptUnprotect(protected)
	if err != nil {
		return nil, fmt.Errorf("descifrar token DPAPI LocalMachine: %w", err)
	}
	return token, nil
}

func cryptProtect(plain []byte) ([]byte, error) {
	input := makeBlob(plain)
	entropy := makeBlob(printAgentEntropy)
	var output dataBlob
	result, _, callErr := procCryptProtectData.Call(
		uintptr(unsafe.Pointer(&input)),
		0,
		uintptr(unsafe.Pointer(&entropy)),
		0,
		0,
		cryptProtectLocalMachine|cryptProtectUIForbidden,
		uintptr(unsafe.Pointer(&output)),
	)
	if result == 0 {
		return nil, normalizeDPAPIError(callErr)
	}
	defer procLocalFree.Call(uintptr(unsafe.Pointer(output.data)))
	return copyBlob(output), nil
}

func cryptUnprotect(protected []byte) ([]byte, error) {
	input := makeBlob(protected)
	entropy := makeBlob(printAgentEntropy)
	var output dataBlob
	result, _, callErr := procCryptUnprotectData.Call(
		uintptr(unsafe.Pointer(&input)),
		0,
		uintptr(unsafe.Pointer(&entropy)),
		0,
		0,
		cryptProtectUIForbidden,
		uintptr(unsafe.Pointer(&output)),
	)
	if result == 0 {
		return nil, normalizeDPAPIError(callErr)
	}
	defer procLocalFree.Call(uintptr(unsafe.Pointer(output.data)))
	return copyBlob(output), nil
}

func makeBlob(data []byte) dataBlob {
	if len(data) == 0 {
		return dataBlob{}
	}
	return dataBlob{size: uint32(len(data)), data: &data[0]}
}

func copyBlob(blob dataBlob) []byte {
	if blob.size == 0 || blob.data == nil {
		return nil
	}
	return append([]byte(nil), unsafe.Slice(blob.data, blob.size)...)
}

func normalizeDPAPIError(err error) error {
	if err == nil || errors.Is(err, windows.ERROR_SUCCESS) {
		return errors.New("operación DPAPI fallida")
	}
	return err
}

func secureDataDirectory(path string) error {
	if err := os.MkdirAll(path, 0o700); err != nil {
		return err
	}
	command := exec.Command(
		"icacls", path,
		"/inheritance:r",
		"/grant:r",
		"*S-1-5-18:(OI)(CI)F",
		"*S-1-5-32-544:(OI)(CI)F",
	)
	if output, err := command.CombinedOutput(); err != nil {
		return fmt.Errorf("aplicar ACL con icacls: %w: %s", err, output)
	}
	return nil
}
