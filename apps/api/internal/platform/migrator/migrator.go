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
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivermigrate"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
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

// PostUp runs River's own schema migrations, upserts the static
// permission catalog (internal/platform/authz/permissions.go), then brings
// every tenant's roles and duty types up to date: first EnsureTenantDefaults
// creates whatever system role or duty type a tenant is still missing (a
// tenant bootstrapped before the module that introduced it, since
// cmd/bootstrap only ever creates super_admin -- see EnsureTenantDefaults's
// doc comment), then syncSystemRoleDefaults additively grants every
// existing system role whatever default permission it does not have yet,
// including the roles EnsureTenantDefaults just created. It expects Up to
// have already run.
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

	tenantIDs, err := queries.ListTenantIDs(ctx)
	if err != nil {
		return fmt.Errorf("list tenants: %w", err)
	}
	for _, tenantID := range tenantIDs {
		if err := EnsureTenantDefaults(ctx, pool, tenantID); err != nil {
			return fmt.Errorf("ensure tenant defaults for %s: %w", tenantID, err)
		}
	}
	return syncSystemRoleDefaults(ctx, pool, tenantIDs)
}

// syncSystemRoleDefaults grants every system role the permissions its
// default set gained since the tenant was created. It only ever adds rows,
// so an admin's customisations (granted or revoked) survive each deploy --
// unless the permission being added is itself still in the role's default
// set, in which case a revoked grant is restored; see EnsureTenantDefaults
// for the routine that instead never touches an existing role at all.
func syncSystemRoleDefaults(ctx context.Context, pool *pgxpool.Pool, tenantIDs []uuid.UUID) error {
	defaults := map[string][]string{}
	for _, rd := range authz.RoleDefaults() {
		defaults[rd.Slug] = rd.Permissions
	}
	for _, tenantID := range tenantIDs {
		err := database.WithTenantTx(ctx, pool, tenantID, func(ctx context.Context) error {
			tx, _ := database.TxFromContext(ctx)
			q := db.New(tx)
			roles, err := q.ListSystemRoles(ctx, tenantID)
			if err != nil {
				return err
			}
			for _, role := range roles {
				for _, code := range defaults[role.Slug] {
					if err := q.AddRolePermission(ctx, db.AddRolePermissionParams{
						RoleID: role.ID, PermissionCode: code, TenantID: tenantID,
					}); err != nil {
						return fmt.Errorf("grant %s to %s: %w", code, role.Slug, err)
					}
				}
			}
			return nil
		})
		if err != nil {
			return fmt.Errorf("sync roles for tenant %s: %w", tenantID, err)
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
