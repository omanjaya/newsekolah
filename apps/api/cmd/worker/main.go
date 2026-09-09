// Command worker runs the River job queue. Phase 0 registers no job kinds
// yet (no module publishes one), so this idles ready for the notify/jobs
// work later phases add; it still exercises the same River schema and
// connection wiring cmd/api and cmd/migrate use.
package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/config"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/jobs"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/telemetry"
)

func main() {
	logger := telemetry.NewLogger()
	if err := run(logger); err != nil {
		logger.Error("worker failed", "error", err)
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

	pool, err := database.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	client, err := jobs.NewClient(pool, jobs.NewWorkers(), logger)
	if err != nil {
		return err
	}

	if err := client.Start(ctx); err != nil {
		return err
	}
	logger.Info("worker started")

	<-ctx.Done()
	logger.Info("worker stopping")
	return client.Stop(context.Background())
}
