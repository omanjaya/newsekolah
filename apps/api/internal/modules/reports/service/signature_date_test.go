package service_test

import (
	"bytes"
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"github.com/xuri/excelize/v2"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/reports/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// signatureLine is the "Place, date" line the XLSX writes above the
// signers, or "" when the sheet has none.
func signatureLine(t *testing.T, out []byte, place string) string {
	t.Helper()
	f, err := excelize.OpenReader(bytes.NewReader(out))
	require.NoError(t, err)
	defer func() { _ = f.Close() }()
	rows, err := f.GetRows(f.GetSheetList()[0])
	require.NoError(t, err)
	for _, row := range rows {
		for _, cell := range row {
			if len(cell) > len(place) && cell[:len(place)] == place {
				return cell
			}
		}
	}
	return ""
}

// TestRunDocumentSignatureDateIsTenantLocalDay is the timezone sweep's
// regression test for the report centre's signature date: an export run
// at 23:30 UTC on 19 November is signed on 20 November for a school in
// Asia/Makassar (07:30 local), not on the UTC date of the instant.
func TestRunDocumentSignatureDateIsTenantLocalDay(t *testing.T) {
	at := time.Date(2026, 11, 19, 23, 30, 0, 0, time.UTC)
	svc := service.New(nil, nil, nil, fakePermits{}, clock.Frozen{At: at})
	svc.SetReportDocDependencies(fakeAcademic{}, fakeLetterhead{
		sig: &reportdoc.Signature{Place: "Mataram", Signers: []reportdoc.Signer{{RoleLabel: "Kepala Sekolah", Name: "Budi"}}},
	})
	tenantID := uuid.New()
	ctx := tenant.WithTenant(context.Background(), tenant.Tenant{ID: tenantID, Timezone: "Asia/Makassar"})

	out, _, err := svc.RunDocument(ctx, tenantID, service.KindExitPermitsYearly, service.RunArgs{},
		reportdoc.Options{Format: reportdoc.FormatXLSX, ShowLetterhead: true}, reportdoc.LocaleID)
	require.NoError(t, err)
	require.Equal(t, "Mataram, 20 November 2026", signatureLine(t, out, "Mataram"))

	// The simulated business clock is honoured and converted the same way.
	sim := clock.WithTime(ctx, time.Date(2027, 1, 31, 16, 0, 0, 0, time.UTC))
	out, _, err = svc.RunDocument(sim, tenantID, service.KindExitPermitsYearly, service.RunArgs{},
		reportdoc.Options{Format: reportdoc.FormatXLSX, ShowLetterhead: true}, reportdoc.LocaleID)
	require.NoError(t, err)
	require.Equal(t, "Mataram, 1 Februari 2027", signatureLine(t, out, "Mataram"))
}
