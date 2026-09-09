package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func toRoleRecord(row db.Role) service.RoleRecord {
	return service.RoleRecord{
		ID: row.ID, Slug: row.Slug, Name: row.Name, Description: pdatabase.TextOrEmpty(row.Description), IsSystem: row.IsSystem,
	}
}

func (r *Repository) ListRolesByTenant(ctx context.Context, tenantID uuid.UUID) ([]service.RoleRecord, error) {
	rows, err := r.queries(ctx).ListRolesByTenant(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list roles by tenant: %w", err)
	}
	out := make([]service.RoleRecord, len(rows))
	for i, row := range rows {
		out[i] = toRoleRecord(row)
	}
	return out, nil
}

func (r *Repository) GetRoleByID(ctx context.Context, tenantID, roleID uuid.UUID) (service.RoleRecord, error) {
	row, err := r.queries(ctx).GetRoleByID(ctx, db.GetRoleByIDParams{TenantID: tenantID, ID: roleID})
	if err != nil {
		return service.RoleRecord{}, fmt.Errorf("get role by id: %w", err)
	}
	return toRoleRecord(row), nil
}

func (r *Repository) GetRoleBySlug(ctx context.Context, tenantID uuid.UUID, slug string) (service.RoleRecord, error) {
	row, err := r.queries(ctx).GetRoleBySlug(ctx, db.GetRoleBySlugParams{TenantID: tenantID, Slug: slug})
	if err != nil {
		return service.RoleRecord{}, fmt.Errorf("get role by slug: %w", err)
	}
	return toRoleRecord(row), nil
}

func (r *Repository) CreateRoleRecord(ctx context.Context, tenantID uuid.UUID, slug, name, description string) (service.RoleRecord, error) {
	row, err := r.queries(ctx).CreateRole(ctx, db.CreateRoleParams{
		TenantID: tenantID, Slug: slug, Name: name, Description: nullableText(description), IsSystem: false,
	})
	if err != nil {
		return service.RoleRecord{}, fmt.Errorf("create role: %w", err)
	}
	return toRoleRecord(row), nil
}

func (r *Repository) UpdateRoleRecord(ctx context.Context, tenantID, roleID uuid.UUID, slug, name, description string) error {
	err := r.queries(ctx).UpdateRole(ctx, db.UpdateRoleParams{
		TenantID: tenantID, ID: roleID, Slug: slug, Name: name, Description: nullableText(description),
	})
	if err != nil {
		return fmt.Errorf("update role: %w", err)
	}
	return nil
}

func (r *Repository) DeleteRoleRecord(ctx context.Context, tenantID, roleID uuid.UUID) error {
	return r.queries(ctx).DeleteRole(ctx, db.DeleteRoleParams{TenantID: tenantID, ID: roleID})
}

func (r *Repository) CountUsersForRole(ctx context.Context, tenantID, roleID uuid.UUID) (int64, error) {
	return r.queries(ctx).CountUsersForRole(ctx, db.CountUsersForRoleParams{TenantID: tenantID, RoleID: roleID})
}

func (r *Repository) DeleteRolePermissions(ctx context.Context, tenantID, roleID uuid.UUID) error {
	return r.queries(ctx).DeleteRolePermissions(ctx, db.DeleteRolePermissionsParams{TenantID: tenantID, RoleID: roleID})
}

func (r *Repository) AddRolePermissionRecord(ctx context.Context, tenantID, roleID uuid.UUID, code string) error {
	return r.queries(ctx).AddRolePermission(ctx, db.AddRolePermissionParams{RoleID: roleID, PermissionCode: code, TenantID: tenantID})
}

func (r *Repository) ListRolePermissionCodes(ctx context.Context, tenantID, roleID uuid.UUID) ([]string, error) {
	return r.queries(ctx).ListRolePermissionCodes(ctx, db.ListRolePermissionCodesParams{TenantID: tenantID, RoleID: roleID})
}

func (r *Repository) ListPermissionsCatalog(ctx context.Context) ([]service.PermissionRecord, error) {
	rows, err := r.queries(ctx).ListPermissionsCatalog(ctx)
	if err != nil {
		return nil, fmt.Errorf("list permissions catalog: %w", err)
	}
	out := make([]service.PermissionRecord, len(rows))
	for i, row := range rows {
		out[i] = service.PermissionRecord{Code: row.Code, Group: row.GroupName, Description: row.Description}
	}
	return out, nil
}
