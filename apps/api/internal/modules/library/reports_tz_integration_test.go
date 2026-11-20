package library

import (
	"bytes"
	"context"
	"strconv"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"github.com/xuri/excelize/v2"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

// TestLibraryReportsUseTheTenantsCalendar proves the period reports read
// their days on the school's calendar. With UTC days a visit or loan at
// 04:34 WITA (UTC+8) was grouped on the previous day, the period window ran
// from 08:00 WITA to 08:00 WITA, and the loans export printed UTC times.
func TestLibraryReportsUseTheTenantsCalendar(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedSimulatedLibraryWorld(t, ctx, pg.AdminPool, "rtz-"+uuid.NewString()[:8])
	_, err := pg.AdminPool.Exec(ctx, `update tenants set timezone = 'Asia/Makassar' where id = $1`, w.tenantID)
	require.NoError(t, err)

	repo := repository.New(pg.AppPool)
	svc := service.New(pg.AppPool, repo, nil, nil, clock.Frozen{At: time.Date(2026, 11, 20, 4, 0, 0, 0, time.UTC)})

	record := func(name string, at time.Time) {
		t.Helper()
		_, err := svc.RecordVisit(clock.WithTime(ctx, at), w.tenantID, service.RecordVisitInput{
			VisitorName: name, Kind: domain.VisitNonMember, GroupSize: 1,
		})
		require.NoError(t, err)
	}
	record("early", time.Date(2026, 11, 18, 20, 34, 0, 0, time.UTC))  // 19 Nov 04:34 WITA
	record("before", time.Date(2026, 11, 17, 23, 0, 0, 0, time.UTC))  // 18 Nov 07:00 WITA, before the period
	record("after", time.Date(2026, 11, 19, 23, 30, 0, 0, time.UTC))  // 20 Nov 07:30 WITA, after the period
	record("after2", time.Date(2026, 11, 19, 22, 0, 0, 0, time.UTC))  // 20 Nov 06:00 WITA, after the period
	record("evening", time.Date(2026, 11, 19, 12, 0, 0, 0, time.UTC)) // 19 Nov 20:00 WITA

	day := func(d int) *time.Time { v := time.Date(2026, 11, d, 0, 0, 0, 0, time.UTC); return &v }

	visits, err := svc.VisitsReport(ctx, w.tenantID, day(19), day(19))
	require.NoError(t, err)
	require.Equal(t, 2, visits.Total, "only the two visits on 19 Nov WITA")
	require.Len(t, visits.PerDay, 1)
	require.Equal(t, "2026-11-19", visits.PerDay[0].Day.Format(time.DateOnly))
	require.Equal(t, 2, visits.PerDay[0].Count)

	// The monthly report's month is the school's month too: a visit at
	// 06:00 WITA on 1 Dec (30 Nov in UTC) is December's.
	record("december", time.Date(2026, 11, 30, 22, 0, 0, 0, time.UTC))
	monthly, err := svc.MonthlyReport(ctx, w.tenantID, "2026-11")
	require.NoError(t, err)
	require.Equal(t, 5, monthly.VisitsThisMonth)

	// A loan at 04:34 WITA on 19 Nov, returned at 09:35 WITA on 20 Nov.
	borrowed := time.Date(2026, 11, 18, 20, 34, 33, 0, time.UTC)
	returned := time.Date(2026, 11, 20, 1, 35, 11, 0, time.UTC)
	_, err = pg.AdminPool.Exec(ctx, `insert into library_loans
		(tenant_id, copy_id, title_id, member_user_id, checked_out_by, borrowed_at, due_on, returned_at, status)
		values ($1, $2, $3, $4, $4, $5, '2026-11-26', $6, 'returned')`,
		w.tenantID, w.copyID, w.titleID, w.memberUserID, borrowed, returned)
	require.NoError(t, err)

	loans, err := svc.LoansInPeriod(ctx, w.tenantID, day(19), day(19))
	require.NoError(t, err)
	require.Len(t, loans, 1, "a loan at 04:34 WITA belongs to 19 Nov")

	out, err := svc.ExportLoansReport(ctx, w.tenantID, day(19), day(19), "id", reportdoc.Options{Format: reportdoc.FormatXLSX, ShowLetterhead: false})
	require.NoError(t, err)
	f, err := excelize.OpenReader(bytes.NewReader(out))
	require.NoError(t, err)
	defer func() { _ = f.Close() }()
	rows, err := f.GetRows(f.GetSheetName(0), excelize.Options{RawCellValue: true})
	require.NoError(t, err)
	var borrowedCell, returnedCell string
	for _, row := range rows {
		if len(row) > 4 && row[0] == "Judul Simulasi" {
			borrowedCell, returnedCell = row[2], row[4]
		}
	}
	require.NotEmpty(t, borrowedCell, "the loan row is in the export: %v", rows)
	toTime := func(raw string) time.Time {
		t.Helper()
		v, err := excelize.ExcelDateToTime(mustFloat(t, raw), false)
		require.NoError(t, err)
		return v
	}
	require.Equal(t, "2026-11-19 04:34", toTime(borrowedCell).Format("2006-01-02 15:04"))
	require.Equal(t, "2026-11-20 09:35", toTime(returnedCell).Format("2006-01-02 15:04"))
}

func mustFloat(t *testing.T, raw string) float64 {
	t.Helper()
	v, err := strconv.ParseFloat(raw, 64)
	require.NoError(t, err, "cell %q is not an Excel date number", raw)
	return v
}
