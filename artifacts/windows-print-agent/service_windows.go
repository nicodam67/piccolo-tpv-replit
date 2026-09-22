//go:build windows

package main

import (
	"context"

	"golang.org/x/sys/windows/svc"
)

const windowsServiceName = "PiccoloPrintAgent"

type serviceHandler struct {
	options runOptions
}

func maybeRunAsWindowsService(options runOptions) (bool, error) {
	isService, err := svc.IsWindowsService()
	if err != nil {
		return false, err
	}
	if !isService {
		return false, nil
	}
	return true, svc.Run(windowsServiceName, &serviceHandler{options: options})
}

func (s *serviceHandler) Execute(
	_ []string,
	requests <-chan svc.ChangeRequest,
	status chan<- svc.Status,
) (bool, uint32) {
	status <- svc.Status{State: svc.StartPending}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	finished := make(chan error, 1)
	go func() { finished <- runAgent(ctx, s.options) }()
	current := svc.Status{
		State:   svc.Running,
		Accepts: svc.AcceptStop | svc.AcceptShutdown,
	}
	status <- current
	for {
		select {
		case request := <-requests:
			switch request.Cmd {
			case svc.Interrogate:
				status <- current
			case svc.Stop, svc.Shutdown:
				current = svc.Status{State: svc.StopPending}
				status <- current
				cancel()
				if err := <-finished; err != nil {
					return false, 1
				}
				return false, 0
			}
		case err := <-finished:
			if err != nil {
				return false, 1
			}
			return false, 0
		}
	}
}
