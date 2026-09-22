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
	"strings"

	"github.com/golang-migrate/migrate/v4"
	"github.com/jackc/pgx/v5/pgxpool"

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
		return runUp(m, cfg, logger)
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

func runUp(m *migrate.Migrate, cfg config.Config, logger *slog.Logger) error {
	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("migrate up: %w", err)
	}
	logger.Info("sql migrations applied")
	return postUp(cfg, logger)
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

// postUp runs River's own schema migrations, upserts the static permission
// catalog (internal/platform/authz/permissions.go is the single source of
// truth; this keeps the database in sync with it on every run), rotates the
// app_rw role's password off its migration-time default, and locks down
// app_platform (nothing currently connects as it -- see
// ensureAppPlatformNoLogin).
func postUp(cfg config.Config, logger *slog.Logger) error {
	ctx := context.Background()

	pool, err := database.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	if err := migrator.PostUp(ctx, pool); err != nil {
		return err
	}
	logger.Info("river migrations applied")
	logger.Info("permission catalog upserted")

	if err := ensureAppRolePassword(ctx, pool, cfg, logger); err != nil {
		return err
	}
	if err := ensureAppPlatformNoLogin(ctx, pool, logger); err != nil {
		return err
	}
	return nil
}

// ensureAppRolePassword sets the app_rw role's login password from
// APP_DB_PASSWORD via ALTER ROLE, so the default password
// 0004_db_roles.up.sql creates it with ('change-me-in-production') is never
// left active. This runs here rather than as a SQL migration because a
// migration file cannot read the process environment.
func ensureAppRolePassword(ctx context.Context, pool *pgxpool.Pool, cfg config.Config, logger *slog.Logger) error {
	var exists bool
	if err := pool.QueryRow(ctx,
		"select exists (select 1 from pg_roles where rolname = 'app_rw')",
	).Scan(&exists); err != nil {
		return fmt.Errorf("check app_rw role: %w", err)
	}
	if !exists {
		// Managed Postgres (RDS, Cloud SQL, ...) where 0004_db_roles skipped
		// role creation for lack of CREATEROLE; app_rw is provisioned out of
		// band there (see that migration's comment), so there is nothing to
		// rotate here.
		return nil
	}

	if cfg.AppDBPassword == "" {
		if cfg.IsProduction() {
			return fmt.Errorf("APP_DB_PASSWORD is required in production: without it app_rw would keep its default migration password (apps/api/migrations/0004_db_roles.up.sql)")
		}
		logger.Warn("APP_DB_PASSWORD not set; app_rw keeps its default migration password (non-production only)")
		return nil
	}

	stmt := fmt.Sprintf("alter role app_rw with password %s", quoteLiteral(cfg.AppDBPassword))
	if _, err := pool.Exec(ctx, stmt); err != nil {
		return fmt.Errorf("set app_rw password: %w", err)
	}
	logger.Info("app_rw password set from APP_DB_PASSWORD")
	return nil
}

// ensureAppPlatformNoLogin locks the app_platform role (also created by
// 0004_db_roles.up.sql, with the same default password) out of logging in
// at all. Nothing in this codebase opens a connection as app_platform --
// database.WithPlatformTx only sets app.platform_admin on whatever role the
// caller's pool already uses (app_rw in production) -- so unlike app_rw
// there is no APP_PLATFORM_DB_PASSWORD to rotate to: the safer fix for an
// unused login role with a hardcoded default password is to make it unable
// to log in at all. If a future platform-console connection needs this
// role, re-enable LOGIN with its own rotated password at that point.
func ensureAppPlatformNoLogin(ctx context.Context, pool *pgxpool.Pool, logger *slog.Logger) error {
	var exists bool
	if err := pool.QueryRow(ctx,
		"select exists (select 1 from pg_roles where rolname = 'app_platform')",
	).Scan(&exists); err != nil {
		return fmt.Errorf("check app_platform role: %w", err)
	}
	if !exists {
		return nil
	}

	if _, err := pool.Exec(ctx, "alter role app_platform nologin"); err != nil {
		return fmt.Errorf("set app_platform nologin: %w", err)
	}
	logger.Info("app_platform set to nologin (unused login role)")
	return nil
}

// quoteLiteral escapes s for use as a single-quoted SQL string literal.
// ALTER ROLE ... PASSWORD takes a string constant, not a query parameter
// (Postgres's grammar requires a literal there), so this stands in for
// parameter binding. Doubling embedded quotes is sufficient because
// standard_conforming_strings is on by default (Postgres 9.1+), so
// backslashes are not treated as escapes.
func quoteLiteral(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "''") + "'"
}
