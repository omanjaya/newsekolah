package service_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

func insertReportHeaderTestTenant(t *testing.T, pool *pgxpool.Pool, slug string) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	err := pool.QueryRow(context.Background(),
		`insert into tenants (slug,name,education_level,timezone,locale,status,plan)
		 values ($1,'Test School','sma','UTC','id','active','default') returning id`, slug).Scan(&id)
	require.NoError(t, err)
	return id
}

func newReportHeaderService(pg dbtest.Postgres) *service.Service {
	return service.New(pg.AppPool, repository.New(pg.AppPool), tenant.ModeSingle, nil)
}

// TestReportHeaderDefaultsToZeroValue proves a tenant that has never
// configured a kop laporan gets a zero-value ReportHeader (no error, no
// logo, no lines, no signers) rather than ErrTenantNotFound or similar --
// RunDocument's callers treat "not configured" as "render without one".
func TestReportHeaderDefaultsToZeroValue(t *testing.T) {
	pg := dbtest.Start(t)
	tenantID := insertReportHeaderTestTenant(t, pg.AdminPool, "report-header-default")
	svc := newReportHeaderService(pg)

	header, err := svc.ReportHeader(context.Background(), tenantID)
	require.NoError(t, err)
	assert.False(t, header.ShowLogo)
	assert.Empty(t, header.Lines)
	assert.Empty(t, header.Place)
	assert.Empty(t, header.Signers)
}

// TestUpdateReportHeaderRoundTrip proves what UpdateReportHeader stores is
// exactly what ReportHeader later reads back, including a signer's
// optional identifier fields, through the app_rw role (RLS enforced).
func TestUpdateReportHeaderRoundTrip(t *testing.T) {
	pg := dbtest.Start(t)
	tenantID := insertReportHeaderTestTenant(t, pg.AdminPool, "report-header-roundtrip")
	actorID := uuid.New()
	svc := newReportHeaderService(pg)
	ctx := context.Background()

	in := domain.ReportHeader{
		ShowLogo: true,
		Lines:    []string{"SMA Negeri 1 Denpasar", "Jl. Kamboja No. 4"},
		Place:    "Denpasar",
		Signers: []domain.ReportHeaderSigner{
			{RoleLabel: "Wali Kelas", Name: "Ni Made Sari", IDLabel: "NIP", IDNumber: "198001012005011001"},
			{RoleLabel: "Kepala Sekolah", Name: "I Wayan Arta"},
		},
	}
	updated, err := svc.UpdateReportHeader(ctx, tenantID, actorID, in)
	require.NoError(t, err)
	assert.Equal(t, in, updated)

	got, err := svc.ReportHeader(ctx, tenantID)
	require.NoError(t, err)
	assert.Equal(t, in, got)

	// A second tenant's report header stays independent (RLS + a distinct
	// tenant_settings row), not shared with the first tenant's.
	otherTenantID := insertReportHeaderTestTenant(t, pg.AdminPool, "report-header-other")
	other, err := svc.ReportHeader(ctx, otherTenantID)
	require.NoError(t, err)
	assert.False(t, other.ShowLogo)
	assert.Empty(t, other.Lines)
}

// TestUpdateReportHeaderValidation proves invalid input is rejected before
// it ever reaches tenant_settings, with the domain's typed sentinel error.
func TestUpdateReportHeaderValidation(t *testing.T) {
	pg := dbtest.Start(t)
	tenantID := insertReportHeaderTestTenant(t, pg.AdminPool, "report-header-invalid")
	svc := newReportHeaderService(pg)
	ctx := context.Background()

	_, err := svc.UpdateReportHeader(ctx, tenantID, uuid.New(), domain.ReportHeader{
		Lines: []string{"1", "2", "3", "4", "5", "6"}, // > MaxReportHeaderLines
	})
	require.ErrorIs(t, err, domain.ErrReportHeaderTooManyLines)

	_, err = svc.UpdateReportHeader(ctx, tenantID, uuid.New(), domain.ReportHeader{
		Signers: []domain.ReportHeaderSigner{{RoleLabel: "Kepala Sekolah"}}, // missing Name
	})
	require.ErrorIs(t, err, domain.ErrReportHeaderSignerInvalid)
}

// TestReportLetterheadWithoutLogo proves ReportLetterhead builds a
// text-only letterhead (no storage lookup attempted) when ShowLogo is
// false, and carries the configured place/signers into the returned
// Signature.
func TestReportLetterheadWithoutLogo(t *testing.T) {
	pg := dbtest.Start(t)
	tenantID := insertReportHeaderTestTenant(t, pg.AdminPool, "report-header-no-logo")
	svc := newReportHeaderService(pg)
	ctx := context.Background()

	_, err := svc.UpdateReportHeader(ctx, tenantID, uuid.New(), domain.ReportHeader{
		ShowLogo: false,
		Lines:    []string{"SMA Negeri 1 Denpasar"},
		Place:    "Denpasar",
		Signers:  []domain.ReportHeaderSigner{{RoleLabel: "Kepala Sekolah", Name: "I Wayan Arta"}},
	})
	require.NoError(t, err)

	lh, sig, err := svc.ReportLetterhead(ctx, tenantID)
	require.NoError(t, err)
	require.NotNil(t, lh)
	assert.Nil(t, lh.Logo)
	assert.Equal(t, []string{"SMA Negeri 1 Denpasar"}, lh.Lines)
	require.NotNil(t, sig)
	assert.Equal(t, "Denpasar", sig.Place)
	require.Len(t, sig.Signers, 1)
	assert.Equal(t, "I Wayan Arta", sig.Signers[0].Name)
}

// TestReportLetterheadShowLogoWithoutBrandingLogo proves ShowLogo=true
// with no branding logo configured degrades to a text-only letterhead
// instead of failing -- there is nothing to embed, not a broken tenant.
func TestReportLetterheadShowLogoWithoutBrandingLogo(t *testing.T) {
	pg := dbtest.Start(t)
	tenantID := insertReportHeaderTestTenant(t, pg.AdminPool, "report-header-showlogo-nologo")
	svc := newReportHeaderService(pg)
	ctx := context.Background()

	_, err := svc.UpdateReportHeader(ctx, tenantID, uuid.New(), domain.ReportHeader{
		ShowLogo: true,
		Lines:    []string{"SMA Negeri 1 Denpasar"},
	})
	require.NoError(t, err)

	lh, _, err := svc.ReportLetterhead(ctx, tenantID)
	require.NoError(t, err)
	require.NotNil(t, lh)
	assert.Nil(t, lh.Logo)
	assert.Equal(t, []string{"SMA Negeri 1 Denpasar"}, lh.Lines)
}

// TestReportLetterheadNoConfigNoSignature proves a tenant with no report
// header at all gets both a nil Letterhead and a nil Signature, so
// RunDocument's caller renders a document with neither rather than an
// empty-but-non-nil block.
func TestReportLetterheadNoConfigNoSignature(t *testing.T) {
	pg := dbtest.Start(t)
	tenantID := insertReportHeaderTestTenant(t, pg.AdminPool, "report-header-unset")
	svc := newReportHeaderService(pg)

	lh, sig, err := svc.ReportLetterhead(context.Background(), tenantID)
	require.NoError(t, err)
	assert.Nil(t, lh)
	assert.Nil(t, sig)
}
