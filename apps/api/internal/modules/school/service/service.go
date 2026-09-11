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
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/storage"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// Repository is the school module's data-access boundary, also satisfying
// platform/tenant.Loader (this module owns tenant resolution reads).
type Repository interface {
	tenant.Loader
	SetupReader

	GetTenantByID(ctx context.Context, id uuid.UUID) (tenant.Tenant, error)
	GetPlatformSetting(ctx context.Context, key string) (string, bool, error)
	SearchTenants(ctx context.Context, query string) ([]domain.TenantSummary, error)
	ListBrandingSettings(ctx context.Context, tenantID uuid.UUID) (map[string]string, error)
	SetBrandingSetting(ctx context.Context, tenantID, actorID uuid.UUID, key, value string) error
	CreateAssetRecord(ctx context.Context, in NewAsset) (AssetRecord, error)

	CreateAcademicYear(ctx context.Context, tenantID uuid.UUID, label string, startsOn, endsOn time.Time) (domain.AcademicYear, error)
	GetActiveAcademicYear(ctx context.Context, tenantID uuid.UUID) (domain.AcademicYear, bool, error)
	GetAcademicYearByID(ctx context.Context, tenantID, id uuid.UUID) (domain.AcademicYear, error)
	DeactivateAllAcademicYears(ctx context.Context, tenantID uuid.UUID) error
	ActivateAcademicYear(ctx context.Context, tenantID, id uuid.UUID) error
	ListAcademicYears(ctx context.Context, tenantID uuid.UUID) ([]domain.AcademicYear, error)

	// ListStudentNISNs backs the Dapodik import's idempotency check.
	ListStudentNISNs(ctx context.Context, tenantID uuid.UUID) (map[string]uuid.UUID, error)
	RecordDapodikImportBatch(ctx context.Context, tenantID uuid.UUID, rowCount, createdCount, updatedCount, errorCount int, createdBy uuid.UUID) error
}

// NewAsset is what CreateAssetRecord persists to assets, mirroring
// identity/service.NewAsset (branding logo/favicon uses the same table and
// upload pipeline as an avatar, just a different kind/visibility).
type NewAsset struct {
	TenantID   uuid.UUID
	Bucket     string
	ObjectKey  string
	Mime       string
	SizeBytes  int64
	SHA256     string
	Kind       string
	Visibility string
	CreatedBy  uuid.UUID
}

// AssetRecord is one assets row.
type AssetRecord struct {
	ID   uuid.UUID
	Mime string
}

type Service struct {
	pool    *pgxpool.Pool
	repo    Repository
	mode    tenant.Mode
	storage *storage.Client

	// academic, identity, and clk back the onboarding wizard (level
	// templates, Dapodik import): grade levels/subjects/periods/classes
	// live in the academic module, student accounts in identity. school is
	// constructed before those modules in cmd/api's wiring order (they
	// both depend on school for the active academic year), so these are
	// nil until SetOnboardingDependencies runs afterwards. Every use of
	// them checks for nil and returns domain.ErrOnboardingUnavailable
	// rather than panicking, so a misconfigured deployment fails as a
	// clean 500 instead of a crash.
	academic AcademicPort
	identity IdentityPort
	clk      clock.Clock
}

func New(pool *pgxpool.Pool, repo Repository, mode tenant.Mode, storageClient *storage.Client) *Service {
	return &Service{pool: pool, repo: repo, mode: mode, storage: storageClient}
}

// SetOnboardingDependencies wires the academic and identity collaborators
// the level-template and Dapodik-import use cases need. cmd/api calls this
// once, right after building the academic and identity modules.
func (s *Service) SetOnboardingDependencies(academic AcademicPort, identity IdentityPort, clk clock.Clock) {
	s.academic = academic
	s.identity = identity
	s.clk = clk
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
	if s.storage != nil {
		if key, ok := settings["branding.logo_object_key"]; ok && key != "" {
			if u, err := s.storage.PresignedGetURL(ctx, key, brandingImageURLTTL); err == nil {
				b.LogoURL = u.String()
			}
		}
		if key, ok := settings["branding.favicon_object_key"]; ok && key != "" {
			if u, err := s.storage.PresignedGetURL(ctx, key, brandingImageURLTTL); err == nil {
				b.FaviconURL = u.String()
			}
		}
	}
	return b, nil
}

// brandingImageURLTTL is long relative to storage.DefaultUploadURLTTL (5
// minutes, sized for a client to immediately PUT to): GetTenantBranding is
// public and cached by browsers/the login screen, so its logo/favicon URL
// needs to stay valid for a normal browsing session, not just one upload
// round trip.
const brandingImageURLTTL = 24 * time.Hour

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
