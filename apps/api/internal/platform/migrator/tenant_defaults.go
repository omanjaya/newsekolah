package migrator

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

// EnsureTenantDefaults creates whatever a tenant is missing from
// authz.RoleDefaults and authz.DutyTypeDefaults: every system role and
// every default duty type. It is idempotent and strictly add-only -- a
// role or duty type that already exists (system or custom, default name or
// renamed, default permissions or an admin's own edit) is never touched;
// only one that does not exist yet is created, and only a freshly created
// one has its full default permission set granted immediately, so it is
// usable the moment it exists.
//
// This is deliberately narrower than syncSystemRoleDefaults (migrator.go),
// which keeps additively granting an EXISTING system role's defaults on
// every migrate run -- that behaviour is untouched and still runs after
// this in PostUp, so a role this call just created also picks up any
// default permission syncSystemRoleDefaults is responsible for.
//
// Two callers: cmd/migrate's PostUp, for every existing tenant on every
// deploy, and cmd/bootstrap, right after a fresh self-host tenant is
// created, so day-one provisioning does not depend on a later migrate run.
// Both replace what used to be one-off migrations per new role (see
// 0117_principal_role.up.sql and 0118_grading_view_grades_permission's
// comments) -- a role or duty type a future module adds to RoleDefaults or
// DutyTypeDefaults now reaches every tenant, including ones bootstrapped
// long before that module existed, without a dedicated migration.
func EnsureTenantDefaults(ctx context.Context, pool *pgxpool.Pool, tenantID uuid.UUID) error {
	return database.WithTenantTx(ctx, pool, tenantID, func(ctx context.Context) error {
		tx, ok := database.TxFromContext(ctx)
		if !ok {
			return fmt.Errorf("tenant transaction missing from context")
		}
		q := db.New(tx)
		if err := ensureRoleDefaults(ctx, q, tenantID); err != nil {
			return err
		}
		return ensureDutyDefaults(ctx, q, tenantID)
	})
}

// ensureRoleDefaults creates every system role from authz.RoleDefaults()
// that the tenant does not already have, granting it its full default
// permission set. RoleSlugSuperAdmin is deliberately skipped: it carries
// every permission in the catalog, including PermPlatformSuperadmin, the
// cross-tenant platform console's own gate (see wiring/platform.go's
// tenantPermissionCodes). cmd/bootstrap already creates it itself for a
// self-host install's one tenant; a tenant provisioned through the
// platform console in multi-tenant mode must never get one auto-created,
// since assigning it to anyone would reach every other tenant's data.
func ensureRoleDefaults(ctx context.Context, q *db.Queries, tenantID uuid.UUID) error {
	for _, rd := range authz.RoleDefaults() {
		if rd.Slug == authz.RoleSlugSuperAdmin {
			continue
		}
		_, err := q.GetRoleBySlug(ctx, db.GetRoleBySlugParams{TenantID: tenantID, Slug: rd.Slug})
		if err == nil {
			continue // already exists -- never touched, per the doc comment above.
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("look up role %s: %w", rd.Slug, err)
		}
		role, err := q.CreateRole(ctx, db.CreateRoleParams{
			TenantID: tenantID, Slug: rd.Slug, Name: rd.Name, IsSystem: true,
		})
		if err != nil {
			return fmt.Errorf("create role %s: %w", rd.Slug, err)
		}
		for _, code := range rd.Permissions {
			if err := q.AddRolePermission(ctx, db.AddRolePermissionParams{
				RoleID: role.ID, PermissionCode: code, TenantID: tenantID,
			}); err != nil {
				return fmt.Errorf("grant %s to new role %s: %w", code, rd.Slug, err)
			}
		}
	}
	return nil
}

// ensureDutyDefaults creates every duty type from authz.DutyTypeDefaults()
// that the tenant does not already have, granting it its full default
// permission set. Unlike roles, no duty type is excluded: none of them
// carry cross-tenant reach.
func ensureDutyDefaults(ctx context.Context, q *db.Queries, tenantID uuid.UUID) error {
	for _, dd := range authz.DutyTypeDefaults() {
		_, err := q.GetDutyTypeBySlug(ctx, db.GetDutyTypeBySlugParams{TenantID: tenantID, Slug: dd.Slug})
		if err == nil {
			continue // already exists -- never touched, per EnsureTenantDefaults's doc comment.
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("look up duty type %s: %w", dd.Slug, err)
		}
		dutyType, err := q.CreateDutyType(ctx, db.CreateDutyTypeParams{
			TenantID: tenantID, Slug: dd.Slug, Name: dd.Name, ScopeKind: dd.ScopeKind,
		})
		if err != nil {
			return fmt.Errorf("create duty type %s: %w", dd.Slug, err)
		}
		for _, code := range dd.Permissions {
			if err := q.AddDutyPermission(ctx, db.AddDutyPermissionParams{
				DutyTypeID: dutyType.ID, PermissionCode: code, TenantID: tenantID,
			}); err != nil {
				return fmt.Errorf("grant %s to new duty %s: %w", code, dd.Slug, err)
			}
		}
	}
	return nil
}
