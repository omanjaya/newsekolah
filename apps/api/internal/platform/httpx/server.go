package httpx

import (
	"context"
	"net/http"
	"time"
)

// NewServer applies the timeouts required by docs/08-security.md section 7.
func NewServer(addr string, handler http.Handler) *http.Server {
	return &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
}

// Shutdown gives in-flight requests up to timeout to finish before the
// server closes its listener.
func Shutdown(ctx context.Context, srv *http.Server, timeout time.Duration) error {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	return srv.Shutdown(ctx)
}
