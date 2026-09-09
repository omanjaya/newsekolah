// Command migrate applies (or rolls back) the SQL schema, runs River's own
// migrations, and upserts the static permission catalog. It never runs
// application business logic.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"

	"github.com/golang-migrate/migrate/v4"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/config"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/migrator"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/telemetry"
)

func main() {
	logger := telemetry.NewLogger()

	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: migrate <up|down|status|version|force <version>>")
		os.Exit(2)
	}

	if err := run(os.Args[1:], logger); err != nil {
		logger.Error("migrate failed", "error", err)
		os.Exit(1)
	}
}

func run(args []string, logger *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	m, err := migrator.New(cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer func() { _, _ = m.Close() }()

	switch args[0] {
	case "up":
		return runUp(m, cfg.DatabaseURL, logger)
	case "down":
		return runDown(m, logger)
	case "status":
		return runStatus(m, logger)
	case "version":
		return runVersion(m)
	case "force":
		return runForce(m, args, logger)
	default:
		return fmt.Errorf("unknown command %q", args[0])
	}
}

func runUp(m *migrate.Migrate, databaseURL string, logger *slog.Logger) error {
	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("migrate up: %w", err)
	}
	logger.Info("sql migrations applied")
	return postUp(databaseURL, logger)
}

func runDown(m *migrate.Migrate, logger *slog.Logger) error {
	if err := m.Steps(-1); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("migrate down: %w", err)
	}
	logger.Info("one migration rolled back")
	return nil
}

func runStatus(m *migrate.Migrate, logger *slog.Logger) error {
	version, dirty, err := m.Version()
	if errors.Is(err, migrate.ErrNilVersion) {
		logger.Info("status", "version", "none", "dirty", false)
		return nil
	}
	if err != nil {
		return fmt.Errorf("read version: %w", err)
	}
	logger.Info("status", "version", version, "dirty", dirty)
	return nil
}

func runVersion(m *migrate.Migrate) error {
	version, _, err := m.Version()
	if errors.Is(err, migrate.ErrNilVersion) {
		fmt.Println("none")
		return nil
	}
	if err != nil {
		return err
	}
	fmt.Println(version)
	return nil
}

func runForce(m *migrate.Migrate, args []string, logger *slog.Logger) error {
	if len(args) < 2 {
		return fmt.Errorf("usage: migrate force <version>")
	}
	var v int
	if _, err := fmt.Sscanf(args[1], "%d", &v); err != nil {
		return fmt.Errorf("invalid version %q: %w", args[1], err)
	}
	if err := m.Force(v); err != nil {
		return fmt.Errorf("force version: %w", err)
	}
	logger.Info("forced version", "version", v)
	return nil
}

// postUp runs River's own schema migrations and upserts the static
// permission catalog (internal/platform/authz/permissions.go is the single
// source of truth; this keeps the database in sync with it on every run).
func postUp(databaseURL string, logger *slog.Logger) error {
	ctx := context.Background()

	pool, err := database.NewPool(ctx, databaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	if err := migrator.PostUp(ctx, pool); err != nil {
		return err
	}
	logger.Info("river migrations applied")
	logger.Info("permission catalog upserted")
	return nil
}
