// Command api wires config, database, cache, and the two Phase 0 modules
// into an HTTP server. It contains no business logic: every decision here
// is "which concrete implementation satisfies which interface", not "what
// should happen when a user logs in".
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/config"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/telemetry"
)

// version is set via -ldflags "-X main.version=...".
var version = "dev"

func main() {
	if len(os.Args) > 1 && os.Args[1] == "--healthcheck" {
		os.Exit(healthcheck())
	}

	logger := telemetry.NewLogger()
	slog.SetDefault(logger)

	if err := run(logger); err != nil {
		logger.Error("fatal", "error", err)
		os.Exit(1)
	}
}

func run(logger *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	tracer, err := telemetry.NewTracerProvider(ctx, cfg.OTelExporterEndpoint, "newsekolah-api", version)
	if err != nil {
		return err
	}
	defer func() { _ = tracer.Shutdown(context.Background()) }()

	pool, err := database.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	if err := database.EnsureLeastPrivilege(ctx, pool, cfg.AppEnv); err != nil {
		return err
	}

	redisClient := newRedisClient(cfg.RedisURL, logger)
	if redisClient != nil {
		defer func() { _ = redisClient.Close() }()
	}

	router, bg, err := buildRouter(cfg, logger, pool, redisClient, version)
	if err != nil {
		return err
	}
	if err := bg.Start(ctx); err != nil {
		return err
	}
	defer func() { _ = bg.Stop(context.Background()) }()

	httpServer := httpx.NewServer(cfg.APIAddr, router)

	errCh := make(chan error, 1)
	go func() {
		logger.Info("listening", "addr", cfg.APIAddr, "version", version, "tenancy_mode", string(cfg.TenancyMode))
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case <-ctx.Done():
	case err := <-errCh:
		return err
	}

	logger.Info("shutting down")
	return httpx.Shutdown(context.Background(), httpServer, 10*time.Second)
}

// healthcheck is the container HEALTHCHECK entry point: the distroless image
// has no shell or curl, so the binary probes itself.
func healthcheck() int {
	addr := os.Getenv("API_ADDR")
	if addr == "" {
		addr = ":8080"
	}
	if addr[0] == ':' {
		addr = "127.0.0.1" + addr
	}
	client := &http.Client{Timeout: 3 * time.Second}
	// #nosec G704 -- addr is the process's own listen address from config, not user input
	resp, err := client.Get("http://" + addr + "/health") //nolint:gosec // addr is the process's own listen address from config, not user input
	if err != nil {
		return 1
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}
