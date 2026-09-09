// Package repository is the sqlc-backed implementation of the platform
// service's data boundary.
package repository

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

type Repository struct{ pool *pgxpool.Pool }

func New(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

var _ service.Repository = (*Repository)(nil)

func (r *Repository) queries(ctx context.Context) *db.Queries {
	if tx, ok := pdatabase.TxFromContext(ctx); ok {
		return db.New(tx)
	}
	return db.New(r.pool)
}

func isUnique(err error) bool {
	var pgErr interface{ SQLState() string }
	return errors.As(err, &pgErr) && pgErr.SQLState() == "23505"
}

func toTenant(row db.Tenant) domain.Tenant {
	return domain.Tenant{
		ID: row.ID, Slug: row.Slug, Name: row.Name, EducationLevel: row.EducationLevel,
		Timezone: row.Timezone, Status: row.Status,
		PrimaryDomain: pdatabase.TextOrEmpty(row.PrimaryDomain),
		CreatedAt:     pdatabase.TimeOrZero(row.CreatedAt),
	}
}

// Tenants.

func (r *Repository) ListTenants(ctx context.Context) ([]domain.Tenant, error) {
	rows, err := r.queries(ctx).PlatformListTenants(ctx)
	if err != nil {
		return nil, fmt.Errorf("list tenants: %w", err)
	}
	out := make([]domain.Tenant, len(rows))
	for i, row := range rows {
		out[i] = toTenant(row)
	}
	return out, nil
}

func (r *Repository) GetTenant(ctx context.Context, id uuid.UUID) (domain.Tenant, bool, error) {
	row, err := r.queries(ctx).GetTenantByID(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Tenant{}, false, nil
	}
	if err != nil {
		return domain.Tenant{}, false, fmt.Errorf("get tenant: %w", err)
	}
	return toTenant(row), true, nil
}

func (r *Repository) CreateTenant(ctx context.Context, in domain.TenantInput) (domain.Tenant, error) {
	row, err := r.queries(ctx).CreateTenant(ctx, db.CreateTenantParams{
		Slug: in.Slug, Name: in.Name, EducationLevel: in.EducationLevel, Timezone: in.Timezone,
		Locale: "id", Status: string(domain.StatusActive), Plan: "default",
	})
	if isUnique(err) {
		return domain.Tenant{}, domain.ErrSlugTaken
	}
	if err != nil {
		return domain.Tenant{}, fmt.Errorf("create tenant: %w", err)
	}
	return toTenant(row), nil
}

func (r *Repository) UpdateTenantStatus(ctx context.Context, id uuid.UUID, status domain.TenantStatus) (domain.Tenant, bool, error) {
	row, err := r.queries(ctx).PlatformUpdateTenantStatus(ctx, db.PlatformUpdateTenantStatusParams{
		ID: id, Status: string(status),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Tenant{}, false, nil
	}
	if err != nil {
		return domain.Tenant{}, false, fmt.Errorf("update tenant status: %w", err)
	}
	return toTenant(row), true, nil
}

func (r *Repository) UpdateTenantDomain(ctx context.Context, id uuid.UUID, host string) (domain.Tenant, bool, error) {
	row, err := r.queries(ctx).PlatformUpdateTenantDomain(ctx, db.PlatformUpdateTenantDomainParams{
		ID: id, PrimaryDomain: pdatabase.Text(host),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Tenant{}, false, nil
	}
	if isUnique(err) {
		return domain.Tenant{}, false, domain.ErrDomainTaken
	}
	if err != nil {
		return domain.Tenant{}, false, fmt.Errorf("update tenant domain: %w", err)
	}
	return toTenant(row), true, nil
}

// Health.

func (r *Repository) CountUsers(ctx context.Context, tenantID uuid.UUID) (int, error) {
	n, err := r.queries(ctx).PlatformCountTenantUsers(ctx, tenantID)
	if err != nil {
		return 0, fmt.Errorf("count tenant users: %w", err)
	}
	return int(n), nil
}

func (r *Repository) ActiveAcademicYearLabel(ctx context.Context, tenantID uuid.UUID) (string, bool, error) {
	label, err := r.queries(ctx).PlatformActiveAcademicYearLabel(ctx, tenantID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("active academic year: %w", err)
	}
	return label, true, nil
}

func (r *Repository) LastActivityAt(ctx context.Context, tenantID uuid.UUID) (*time.Time, error) {
	// audit_logs.tenant_id is nullable (set-null on tenant deletion), so
	// sqlc infers this parameter as a nullable uuid even though the value
	// passed here is always present.
	last, err := r.queries(ctx).PlatformLastActivityAt(ctx, pdatabase.NullUUID(uuid.NullUUID{UUID: tenantID, Valid: true}))
	if err != nil {
		return nil, fmt.Errorf("last activity: %w", err)
	}
	return pdatabase.TimePtr(last), nil
}

// Feature flags.

func (r *Repository) ListFeatureFlags(ctx context.Context, tenantID uuid.UUID) ([]domain.ModuleFlag, error) {
	rows, err := r.queries(ctx).PlatformListFeatureFlags(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list feature flags: %w", err)
	}
	out := make([]domain.ModuleFlag, len(rows))
	for i, row := range rows {
		out[i] = domain.ModuleFlag{Module: row.Module, Enabled: row.Enabled}
	}
	return out, nil
}

func (r *Repository) SetFeatureFlag(ctx context.Context, tenantID uuid.UUID, module domain.Module, enabled bool) (domain.ModuleFlag, error) {
	row, err := r.queries(ctx).PlatformUpsertFeatureFlag(ctx, db.PlatformUpsertFeatureFlagParams{
		TenantID: tenantID, Module: string(module), Enabled: enabled,
	})
	if err != nil {
		return domain.ModuleFlag{}, fmt.Errorf("set feature flag: %w", err)
	}
	return domain.ModuleFlag{Module: row.Module, Enabled: row.Enabled}, nil
}

// Exports.

func toExport(row db.TenantExport) domain.Export {
	return domain.Export{
		ID: row.ID, TenantID: row.TenantID, Status: row.Status, ObjectKey: row.ObjectKey,
		ErrorMessage: row.ErrorMessage, CreatedAt: pdatabase.TimeOrZero(row.CreatedAt),
		CompletedAt: pdatabase.TimePtr(row.CompletedAt),
	}
}

func (r *Repository) CreateExport(ctx context.Context, tenantID uuid.UUID) (domain.Export, error) {
	row, err := r.queries(ctx).PlatformCreateExport(ctx, tenantID)
	if err != nil {
		return domain.Export{}, fmt.Errorf("create export: %w", err)
	}
	return toExport(row), nil
}

func (r *Repository) GetExport(ctx context.Context, tenantID, exportID uuid.UUID) (domain.Export, bool, error) {
	row, err := r.queries(ctx).PlatformGetExport(ctx, db.PlatformGetExportParams{TenantID: tenantID, ID: exportID})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Export{}, false, nil
	}
	if err != nil {
		return domain.Export{}, false, fmt.Errorf("get export: %w", err)
	}
	return toExport(row), true, nil
}

func (r *Repository) UpdateExportStatus(ctx context.Context, exportID uuid.UUID, status domain.ExportStatus, objectKey, errMsg string, completedAt *time.Time) error {
	var completed pgtype.Timestamptz
	if completedAt != nil {
		completed = pdatabase.Timestamptz(*completedAt)
	}
	_, err := r.queries(ctx).PlatformUpdateExportStatus(ctx, db.PlatformUpdateExportStatusParams{
		ID: exportID, Status: string(status), ObjectKey: objectKey, ErrorMessage: errMsg, CompletedAt: completed,
	})
	if err != nil {
		return fmt.Errorf("update export status: %w", err)
	}
	return nil
}

// CSV exports: each returns a header row followed by one row per record,
// ready for encoding/csv.

func (r *Repository) ExportUsersCSV(ctx context.Context, tenantID uuid.UUID) ([][]string, error) {
	rows, err := r.queries(ctx).PlatformExportUsers(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("export users: %w", err)
	}
	out := [][]string{{"id", "username", "email", "phone", "name", "status", "created_at"}}
	for _, row := range rows {
		out = append(out, []string{
			row.ID.String(), row.Username, pdatabase.TextOrEmpty(row.Email), pdatabase.TextOrEmpty(row.Phone),
			row.Name, row.Status, pdatabase.TimeOrZero(row.CreatedAt).Format(time.RFC3339),
		})
	}
	return out, nil
}

func (r *Repository) ExportAcademicYearsCSV(ctx context.Context, tenantID uuid.UUID) ([][]string, error) {
	rows, err := r.queries(ctx).PlatformExportAcademicYears(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("export academic years: %w", err)
	}
	out := [][]string{{"id", "label", "starts_on", "ends_on", "is_active"}}
	for _, row := range rows {
		out = append(out, []string{
			row.ID.String(), row.Label, dateString(row.StartsOn), dateString(row.EndsOn), strconv.FormatBool(row.IsActive),
		})
	}
	return out, nil
}

func (r *Repository) ExportClassesCSV(ctx context.Context, tenantID uuid.UUID) ([][]string, error) {
	rows, err := r.queries(ctx).PlatformExportClasses(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("export classes: %w", err)
	}
	out := [][]string{{"id", "name", "capacity", "created_at"}}
	for _, row := range rows {
		capacity := ""
		if row.Capacity.Valid {
			capacity = strconv.FormatInt(int64(row.Capacity.Int32), 10)
		}
		out = append(out, []string{
			row.ID.String(), row.Name, capacity, pdatabase.TimeOrZero(row.CreatedAt).Format(time.RFC3339),
		})
	}
	return out, nil
}

func dateString(d pgtype.Date) string {
	if !d.Valid {
		return ""
	}
	return d.Time.Format("2006-01-02")
}
