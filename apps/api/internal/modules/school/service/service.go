// Package service implements the school module's use cases: tenant
// branding/lookup and academic year management (create, activate with a
// single-active guarantee). HTTP exposure of academic year CRUD is not part
// of the Phase 0 contract; this service is ready for it regardless.
package service

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// Repository is the school module's data-access boundary, also satisfying
// platform/tenant.Loader (this module owns tenant resolution reads).
type Repository interface {
	tenant.Loader

	GetTenantByID(ctx context.Context, id uuid.UUID) (tenant.Tenant, error)
	GetPlatformSetting(ctx context.Context, key string) (string, bool, error)
	SearchTenants(ctx context.Context, query string) ([]domain.TenantSummary, error)
	ListBrandingSettings(ctx context.Context, tenantID uuid.UUID) (map[string]string, error)

	CreateAcademicYear(ctx context.Context, tenantID uuid.UUID, label string, startsOn, endsOn time.Time) (domain.AcademicYear, error)
	GetActiveAcademicYear(ctx context.Context, tenantID uuid.UUID) (domain.AcademicYear, bool, error)
	GetAcademicYearByID(ctx context.Context, tenantID, id uuid.UUID) (domain.AcademicYear, error)
	DeactivateAllAcademicYears(ctx context.Context, tenantID uuid.UUID) error
	ActivateAcademicYear(ctx context.Context, tenantID, id uuid.UUID) error
	ListAcademicYears(ctx context.Context, tenantID uuid.UUID) ([]domain.AcademicYear, error)
}

type Service struct {
	pool *pgxpool.Pool
	repo Repository
	mode tenant.Mode
}

func New(pool *pgxpool.Pool, repo Repository, mode tenant.Mode) *Service {
	return &Service{pool: pool, repo: repo, mode: mode}
}

// withTx opens the tenant-scoped transaction for one use case, per
// docs/03-layered-architecture.md section 2.
func (s *Service) withTx(ctx context.Context, tenantID uuid.UUID, fn func(ctx context.Context) error) error {
	return database.WithTenantTx(ctx, s.pool, tenantID, fn)
}

// Branding builds the public branding view for a tenant: tenant row
// defaults, overridden by any "branding.*" tenant_settings key.
func (s *Service) Branding(ctx context.Context, tenantID uuid.UUID) (domain.Branding, error) {
	t, err := s.repo.GetTenantByID(ctx, tenantID)
	if err != nil {
		return domain.Branding{}, domain.ErrTenantNotFound
	}

	var settings map[string]string
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		settings, err = s.repo.ListBrandingSettings(ctx, tenantID)
		return err
	})
	if err != nil {
		settings = map[string]string{}
	}

	b := domain.Branding{
		TenantID:    t.ID,
		Slug:        t.Slug,
		Name:        t.Name,
		AccentColor: domain.DefaultAccentColor,
		Locale:      t.Locale,
		Timezone:    t.Timezone,
	}
	b.ProductName = domain.DefaultProductName
	if v, ok, err := s.repo.GetPlatformSetting(ctx, "product_name"); err == nil && ok && v != "" {
		b.ProductName = v
	}
	if v, ok := settings["branding.name"]; ok && v != "" {
		b.Name = v
	}
	if v, ok := settings["branding.short_name"]; ok {
		b.ShortName = v
	}
	if v, ok := settings["branding.tagline"]; ok {
		b.Tagline = v
	}
	if v, ok := settings["branding.accent_color"]; ok && v != "" {
		b.AccentColor = v
	}
	return b, nil
}

// LookupTenants searches schools by name or slug. In single-tenant mode it
// returns only the one tenant when it matches the query, per the contract's
// description of this endpoint.
func (s *Service) LookupTenants(ctx context.Context, query string) ([]domain.TenantSummary, error) {
	if s.mode == tenant.ModeSingle {
		t, err := s.repo.GetSingle(ctx)
		if err != nil {
			return nil, nil
		}
		if !matchesQuery(t.Name, t.Slug, query) {
			return nil, nil
		}
		return []domain.TenantSummary{{ID: t.ID, Slug: t.Slug, Name: t.Name}}, nil
	}
	return s.repo.SearchTenants(ctx, query)
}

func matchesQuery(name, slug, query string) bool {
	q := strings.ToLower(query)
	return strings.Contains(strings.ToLower(name), q) || strings.Contains(strings.ToLower(slug), q)
}
