// Command etl performs a one-way, idempotent migration of an existing SION
// (MySQL) school database into a newsekolah tenant (Postgres). It is meant
// to run repeatedly while the old system stays live (docs/12-roadmap.md's
// parallel-run mitigation for a partially failed migration): a re-run
// against unchanged source data updates in place instead of duplicating
// rows, and every run ends with a difference report on stdout and as JSON.
//
// See docs/13-etl-sion.md for how to run it, what it maps, and what it
// cannot map.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/telemetry"
)

func main() {
	logger := telemetry.NewLogger()
	if err := run(os.Args[1:], logger); err != nil {
		logger.Error("etl failed", "error", err)
		os.Exit(1)
	}
}

func run(args []string, logger *slog.Logger) error {
	cfg, err := loadConfig(args)
	if err != nil {
		return err
	}

	ctx := context.Background()

	source, err := openSource(cfg.SourceMySQLDSN)
	if err != nil {
		return err
	}
	defer func() { _ = source.Close() }()

	pool, err := database.NewPool(ctx, cfg.TargetDatabase)
	if err != nil {
		return fmt.Errorf("connect target database: %w", err)
	}
	defer pool.Close()

	report, err := migrate(ctx, cfg, source, pool, clock.Real{}, logger)
	if err != nil {
		return err
	}

	report.WriteHuman(os.Stdout)
	if err := report.WriteJSON(cfg.ReportPath); err != nil {
		return err
	}
	logger.Info("etl report written", "path", cfg.ReportPath, "dry_run", cfg.DryRun)
	return nil
}
