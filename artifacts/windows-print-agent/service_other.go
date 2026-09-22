//go:build !windows

package main

func maybeRunAsWindowsService(runOptions) (bool, error) {
	return false, nil
}
