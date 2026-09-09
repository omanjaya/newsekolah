// Package migrator wraps golang-migrate (embedded SQL) and River's own
// migrations behind one API, so cmd/migrate and the integration test suite
// apply the exact same schema instead of two hand-maintained copies of the
// same steps.
package migrator

import (
	"context"
	"fmt"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivermigrate"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	migrationsfs "github.com/omanjaya/newsekolah/apps/api/migrations"
)

// New opens a golang-migrate instance backed by the embedded SQL migration
// files, against databaseURL.
func New(databaseURL string) (*migrate.Migrate, error) {
	source, err := iofs.New(migrationsfs.FS, ".")
	if err != nil {
		return nil, fmt.Errorf("load embedded migrations: %w", err)
	}
	m, err := migrate.NewWithSourceInstance("iofs", source, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("init migrate: %w", err)
	}
	return m, nil
}

// Up applies every pending SQL migration.
func Up(databaseURL string) error {
	m, err := New(databaseURL)
	if err != nil {
		return err
	}
	defer func() { _, _ = m.Close() }()

	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return fmt.Errorf("migrate up: %w", err)
	}
	return nil
}

// PostUp runs River's own schema migrations and upserts the static
// permission catalog (internal/platform/authz/permissions.go). It expects
// Up to have already run.
func PostUp(ctx context.Context, pool *pgxpool.Pool) error {
	riverMigrator, err := rivermigrate.New(riverpgxv5.New(pool), nil)
	if err != nil {
		return fmt.Errorf("init river migrator: %w", err)
	}
	if _, err := riverMigrator.Migrate(ctx, rivermigrate.DirectionUp, nil); err != nil {
		return fmt.Errorf("river migrate up: %w", err)
	}

	queries := db.New(pool)
	for _, p := range authz.Catalog {
		if err := queries.UpsertPermission(ctx, db.UpsertPermissionParams{
			Code: p.Code, GroupName: p.Group, Description: p.Description,
		}); err != nil {
			return fmt.Errorf("upsert permission %s: %w", p.Code, err)
		}
	}
	return nil
}

// UpAll runs Up followed by PostUp, the one-shot path integration tests
// use against a fresh container.
func UpAll(ctx context.Context, databaseURL string, pool *pgxpool.Pool) error {
	if err := Up(databaseURL); err != nil {
		return err
	}
	return PostUp(ctx, pool)
}
