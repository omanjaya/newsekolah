// Package repository implements school/service.Repository (and, by
// extension, platform/tenant.Loader) using sqlc's generated Queries.
package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

type Repository struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

var _ service.Repository = (*Repository)(nil)

func (r *Repository) queries(ctx context.Context) *db.Queries {
	if tx, ok := pdatabase.TxFromContext(ctx); ok {
		return db.New(tx)
	}
	return db.New(r.pool)
}

// GetBySlug, GetByDomain, and GetSingle read the `tenants` table directly
// off the pool: it carries no RLS policy (tenant resolution has to work
// before any tenant context exists), so no transaction is needed here.
func (r *Repository) GetBySlug(ctx context.Context, slug string) (tenant.Tenant, error) {
	row, err := db.New(r.pool).GetTenantBySlug(ctx, slug)
	if err != nil {
		return tenant.Tenant{}, fmt.Errorf("get tenant by slug: %w", err)
	}
	return toTenant(row), nil
}

func (r *Repository) GetByDomain(ctx context.Context, host string) (tenant.Tenant, error) {
	row, err := db.New(r.pool).GetTenantByDomain(ctx, pdatabase.Text(host))
	if err != nil {
		return tenant.Tenant{}, fmt.Errorf("get tenant by domain: %w", err)
	}
	return toTenant(row), nil
}

func (r *Repository) GetSingle(ctx context.Context) (tenant.Tenant, error) {
	row, err := db.New(r.pool).GetSingleTenant(ctx)
	if err != nil {
		return tenant.Tenant{}, fmt.Errorf("get single tenant: %w", err)
	}
	return toTenant(row), nil
}

func (r *Repository) GetTenantByID(ctx context.Context, id uuid.UUID) (tenant.Tenant, error) {
	row, err := db.New(r.pool).GetTenantByID(ctx, id)
	if err != nil {
		return tenant.Tenant{}, fmt.Errorf("get tenant by id: %w", err)
	}
	return toTenant(row), nil
}

func (r *Repository) SearchTenants(ctx context.Context, query string) ([]domain.TenantSummary, error) {
	rows, err := db.New(r.pool).SearchTenants(ctx, "%"+query+"%")
	if err != nil {
		return nil, fmt.Errorf("search tenants: %w", err)
	}
	out := make([]domain.TenantSummary, len(rows))
	for i, row := range rows {
		out[i] = domain.TenantSummary{ID: row.ID, Slug: row.Slug, Name: row.Name}
	}
	return out, nil
}

func (r *Repository) ListBrandingSettings(ctx context.Context, tenantID uuid.UUID) (map[string]string, error) {
	rows, err := r.queries(ctx).ListTenantSettingsByPrefix(ctx, db.ListTenantSettingsByPrefixParams{
		TenantID: tenantID, Key: "branding.%",
	})
	if err != nil {
		return nil, fmt.Errorf("list branding settings: %w", err)
	}
	out := make(map[string]string, len(rows))
	for _, row := range rows {
		var v string
		if err := json.Unmarshal(row.Value, &v); err == nil {
			out[row.Key] = v
		}
	}
	return out, nil
}

// GetPlatformSetting reads a platform-level string setting off the pool;
// platform_settings carries no tenant policy.
func (r *Repository) GetPlatformSetting(ctx context.Context, key string) (string, bool, error) {
	raw, err := db.New(r.pool).GetPlatformSetting(ctx, key)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", false, nil
		}
		return "", false, fmt.Errorf("get platform setting %s: %w", key, err)
	}
	var v string
	if err := json.Unmarshal(raw, &v); err != nil {
		return "", false, nil
	}
	return v, true, nil
}

func (r *Repository) CreateAcademicYear(ctx context.Context, tenantID uuid.UUID, label string, startsOn, endsOn time.Time) (domain.AcademicYear, error) {
	row, err := r.queries(ctx).CreateAcademicYear(ctx, db.CreateAcademicYearParams{
		TenantID: tenantID, Label: label, StartsOn: pdatabase.Date(startsOn), EndsOn: pdatabase.Date(endsOn), IsActive: false,
	})
	if err != nil {
		return domain.AcademicYear{}, fmt.Errorf("create academic year: %w", err)
	}
	return toAcademicYear(row), nil
}

func (r *Repository) GetActiveAcademicYear(ctx context.Context, tenantID uuid.UUID) (domain.AcademicYear, bool, error) {
	row, err := r.queries(ctx).GetActiveAcademicYear(ctx, tenantID)
	if err != nil {
		return domain.AcademicYear{}, false, nil
	}
	return toAcademicYear(row), true, nil
}

func (r *Repository) GetAcademicYearByID(ctx context.Context, tenantID, id uuid.UUID) (domain.AcademicYear, error) {
	row, err := r.queries(ctx).GetAcademicYearByID(ctx, db.GetAcademicYearByIDParams{TenantID: tenantID, ID: id})
	if err != nil {
		return domain.AcademicYear{}, fmt.Errorf("get academic year: %w", err)
	}
	return toAcademicYear(row), nil
}

func (r *Repository) DeactivateAllAcademicYears(ctx context.Context, tenantID uuid.UUID) error {
	return r.queries(ctx).DeactivateAllAcademicYears(ctx, tenantID)
}

func (r *Repository) ActivateAcademicYear(ctx context.Context, tenantID, id uuid.UUID) error {
	return r.queries(ctx).ActivateAcademicYear(ctx, db.ActivateAcademicYearParams{TenantID: tenantID, ID: id})
}

func (r *Repository) ListAcademicYears(ctx context.Context, tenantID uuid.UUID) ([]domain.AcademicYear, error) {
	rows, err := r.queries(ctx).ListAcademicYears(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list academic years: %w", err)
	}
	out := make([]domain.AcademicYear, len(rows))
	for i, row := range rows {
		out[i] = toAcademicYear(row)
	}
	return out, nil
}

func toTenant(row db.Tenant) tenant.Tenant {
	return tenant.Tenant{
		ID:             row.ID,
		Slug:           row.Slug,
		Name:           row.Name,
		EducationLevel: row.EducationLevel,
		Timezone:       row.Timezone,
		Locale:         row.Locale,
		Status:         row.Status,
	}
}

func toAcademicYear(row db.AcademicYear) domain.AcademicYear {
	return domain.AcademicYear{
		ID:       row.ID,
		TenantID: row.TenantID,
		Label:    row.Label,
		StartsOn: pdatabase.DateOrZero(row.StartsOn),
		EndsOn:   pdatabase.DateOrZero(row.EndsOn),
		IsActive: row.IsActive,
	}
}
