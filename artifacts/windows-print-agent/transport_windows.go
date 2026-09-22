//go:build windows

package main

import (
	"context"
	"errors"
	"fmt"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	winspool             = windows.NewLazySystemDLL("winspool.drv")
	procOpenPrinter      = winspool.NewProc("OpenPrinterW")
	procClosePrinter     = winspool.NewProc("ClosePrinter")
	procStartDocPrinter  = winspool.NewProc("StartDocPrinterW")
	procEndDocPrinter    = winspool.NewProc("EndDocPrinter")
	procStartPagePrinter = winspool.NewProc("StartPagePrinter")
	procEndPagePrinter   = winspool.NewProc("EndPagePrinter")
	procWritePrinter     = winspool.NewProc("WritePrinter")
	procAbortPrinter     = winspool.NewProc("AbortPrinter")
)

type windowsRawTransport struct{}

type docInfo1 struct {
	docName    *uint16
	outputFile *uint16
	dataType   *uint16
}

func (windowsRawTransport) Print(
	ctx context.Context,
	printer PrinterConfig,
	payload []byte,
	copies int,
) (string, error) {
	queueName, err := windows.UTF16PtrFromString(printer.Target.QueueName)
	if err != nil {
		return "", &PrintFailure{Err: err}
	}
	var handle windows.Handle
	if err := boolCall(procOpenPrinter.Call(
		uintptr(unsafe.Pointer(queueName)),
		uintptr(unsafe.Pointer(&handle)),
		0,
	)); err != nil {
		return "", &PrintFailure{Err: fmt.Errorf("OpenPrinter: %w", err)}
	}
	defer procClosePrinter.Call(uintptr(handle))

	completedCopies := 0
	for copyNumber := 0; copyNumber < copies; copyNumber++ {
		if err := ctx.Err(); err != nil {
			return "", &PrintFailure{Err: err, Ambiguous: completedCopies > 0}
		}
		wrote, err := writeRawDocument(handle, payload)
		if err != nil {
			return "", &PrintFailure{
				Err:       err,
				Ambiguous: completedCopies > 0 || wrote,
			}
		}
		completedCopies++
	}
	return "spooler", nil
}

func writeRawDocument(handle windows.Handle, payload []byte) (wrote bool, err error) {
	docName, _ := windows.UTF16PtrFromString("Piccolo ESC/POS")
	raw, _ := windows.UTF16PtrFromString("RAW")
	info := docInfo1{docName: docName, dataType: raw}
	jobID, _, callErr := procStartDocPrinter.Call(
		uintptr(handle),
		1,
		uintptr(unsafe.Pointer(&info)),
	)
	if jobID == 0 {
		return false, fmt.Errorf("StartDocPrinter: %w", normalizeWindowsError(callErr))
	}
	documentOpen := true
	defer func() {
		if documentOpen {
			procAbortPrinter.Call(uintptr(handle))
		}
	}()
	if err := boolCall(procStartPagePrinter.Call(uintptr(handle))); err != nil {
		return false, fmt.Errorf("StartPagePrinter: %w", err)
	}
	if len(payload) > 0 {
		var written uint32
		if err := boolCall(procWritePrinter.Call(
			uintptr(handle),
			uintptr(unsafe.Pointer(&payload[0])),
			uintptr(uint32(len(payload))),
			uintptr(unsafe.Pointer(&written)),
		)); err != nil {
			return written > 0, fmt.Errorf("WritePrinter: %w", err)
		}
		if int(written) != len(payload) {
			return written > 0, fmt.Errorf("WritePrinter incompleto: %d de %d bytes", written, len(payload))
		}
		wrote = true
	}
	if err := boolCall(procEndPagePrinter.Call(uintptr(handle))); err != nil {
		return wrote, fmt.Errorf("EndPagePrinter: %w", err)
	}
	if err := boolCall(procEndDocPrinter.Call(uintptr(handle))); err != nil {
		return wrote, fmt.Errorf("EndDocPrinter: %w", err)
	}
	documentOpen = false
	return wrote, nil
}

func boolCall(result uintptr, _ uintptr, callErr error) error {
	if result != 0 {
		return nil
	}
	return normalizeWindowsError(callErr)
}

func normalizeWindowsError(err error) error {
	if err == nil || errors.Is(err, windows.ERROR_SUCCESS) {
		return errors.New("operación Winspool fallida")
	}
	return err
}
