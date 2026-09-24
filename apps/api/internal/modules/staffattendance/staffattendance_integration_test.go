package staffattendance

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/staffattendance/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
	tenantctx "github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// stubYears always answers "no active academic year", so
// Service.isWorkingDay treats every weekday as a working day without a
// real academic-year fixture -- this test is about the roster-wide recap,
// not calendar integration.
type stubYears struct{}

func (stubYears) GetActiveAcademicYearID(context.Context, uuid.UUID) (uuid.UUID, bool, error) {
	return uuid.Nil, false, nil
}

type stubCalendar struct{}

func (stubCalendar) IsSchoolDay(context.Context, uuid.UUID, uuid.UUID, time.Time) (bool, error) {
	return true, nil
}

type stubLeave struct{}

func (stubLeave) OnApprovedLeave(context.Context, uuid.UUID, uuid.UUID, time.Time) (bool, error) {
	return false, nil
}

// stubLetterhead is a minimal reportdoc.LetterheadSource, standing in for
// the school module's ReportLetterhead in this test -- just enough to
// confirm withLetterhead actually wires a tenant's kop laporan into an
// export rather than checking school's own storage/branding logic again.
type stubLetterhead struct{}

func (stubLetterhead) Letterhead(context.Context, uuid.UUID) (*reportdoc.Letterhead, *reportdoc.Signature, error) {
	return &reportdoc.Letterhead{Lines: []string{"SMA Test"}}, nil, nil
}

func TestGetAllEmployeesMonthlyRecap(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()

	adminQ := db.New(pg.AdminPool)
	tenant, err := adminQ.CreateTenant(ctx, db.CreateTenantParams{
		Slug: "staff-attendance-test-" + uuid.NewString(), Name: "Staff Attendance Test", EducationLevel: "sma",
		Timezone: "Asia/Jakarta", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)

	mod := Register(Dependencies{
		Pool: pg.AppPool, Years: stubYears{}, Calendar: stubCalendar{}, Leave: stubLeave{}, Letterhead: stubLetterhead{},
	})

	// newEmployee seeds one user via the admin pool (bypassing RLS, the way
	// a one-off admin script would) and gives them a full 7-day working
	// schedule through mod.Service (the app_rw pool, RLS enforced).
	newEmployee := func(name string) uuid.UUID {
		user, err := adminQ.CreateUser(ctx, db.CreateUserParams{
			TenantID: tenant.ID, Username: "pegawai-" + uuid.NewString(), PasswordHash: "x",
			Name: name, Status: "active", Locale: "id",
		})
		require.NoError(t, err)

		days := make([]service.ScheduleDayInput, 0, 7)
		for weekday := int16(1); weekday <= 7; weekday++ {
			days = append(days, service.ScheduleDayInput{
				Weekday: weekday, IsWorkingDay: true, StartMinute: 8 * 60, EndMinute: 16 * 60, GraceMinutes: 0,
			})
		}
		_, err = mod.Service.ReplaceWeeklySchedule(ctx, tenant.ID, user.ID, user.ID, days)
		require.NoError(t, err)
		return user.ID
	}

	employeeA := newEmployee("Budi")
	employeeB := newEmployee("Citra")

	// Budi actually shows up on 2025-02-03 (present); every other day for
	// both employees resolves to absent since no record exists.
	arrival := time.Date(2025, 2, 3, 8, 0, 0, 0, time.UTC)
	departure := time.Date(2025, 2, 3, 16, 0, 0, 0, time.UTC)
	_, err = mod.Service.RecordManual(ctx, tenant.ID, employeeA, service.EntryInput{
		EmployeeUserID: employeeA, Date: time.Date(2025, 2, 3, 0, 0, 0, 0, time.UTC),
		ArrivalAt: &arrival, DepartureAt: &departure,
	})
	require.NoError(t, err)

	recaps, err := mod.Service.GetAllEmployeesMonthlyRecap(ctx, tenant.ID, "2025-02")
	require.NoError(t, err)
	require.Len(t, recaps, 2, "both roster employees must appear in the tenant-wide recap")

	byEmployee := make(map[uuid.UUID]service.MonthlyRecap, len(recaps))
	for _, r := range recaps {
		byEmployee[r.EmployeeUserID] = r
	}

	recapA, ok := byEmployee[employeeA]
	require.True(t, ok)
	require.Equal(t, "Budi", recapA.EmployeeName)
	require.Len(t, recapA.Days, 28, "February 2025 has 28 days")
	require.Equal(t, 1, recapA.StatusTotals["present"])
	require.Equal(t, 27, recapA.StatusTotals["absent"])

	recapB, ok := byEmployee[employeeB]
	require.True(t, ok)
	require.Equal(t, "Citra", recapB.EmployeeName)
	require.Len(t, recapB.Days, 28)
	require.Equal(t, 0, recapB.StatusTotals["present"])
	require.Equal(t, 28, recapB.StatusTotals["absent"])

	xlsx, err := mod.Service.ExportAllEmployeesMonthlyRecapReport(ctx, tenant.ID, "2025-02", reportdoc.LocaleID, reportdoc.Options{Format: reportdoc.FormatXLSX})
	require.NoError(t, err)
	require.NotEmpty(t, xlsx)

	pdf, err := mod.Service.ExportMonthlyRecapReport(ctx, tenant.ID, employeeA, "2025-02", reportdoc.LocaleID, reportdoc.Options{Format: reportdoc.FormatPDF, ShowLetterhead: true})
	require.NoError(t, err)
	require.NotEmpty(t, pdf)

	// An unknown column key in the caller's selection is rejected rather
	// than silently ignored.
	_, err = mod.Service.ExportMonthlyRecapReport(ctx, tenant.ID, employeeA, "2025-02", reportdoc.LocaleID, reportdoc.Options{
		Format: reportdoc.FormatXLSX, Columns: []reportdoc.ColumnChoice{{Key: "not_a_real_column"}},
	})
	require.ErrorIs(t, err, reportdoc.ErrUnknownColumn)

	// The tenant's kop laporan (stubLetterhead above) is wired in and
	// actually reaches the rendered file: turning it off produces a
	// visibly smaller workbook.
	withHeader, err := mod.Service.ExportMonthlyRecapReport(ctx, tenant.ID, employeeA, "2025-02", reportdoc.LocaleID, reportdoc.Options{Format: reportdoc.FormatXLSX, ShowLetterhead: true})
	require.NoError(t, err)
	withoutHeader, err := mod.Service.ExportMonthlyRecapReport(ctx, tenant.ID, employeeA, "2025-02", reportdoc.LocaleID, reportdoc.Options{Format: reportdoc.FormatXLSX, ShowLetterhead: false})
	require.NoError(t, err)
	require.Greater(t, len(withHeader), len(withoutHeader), "the letterhead line must add real content to the workbook")

	// An employee without view_staff_attendance can still read their own
	// history through /v1/staff-attendance/me/history (the check-in
	// screen's "this week" panel): the handler resolves the acting user
	// from the request context, the same way ScanStaffAttendance does,
	// rather than trusting a path parameter -- so it never needs the
	// manager permission GetStaffAttendanceHistory requires.
	t.Run("self-service history resolves the current user from context, not a path parameter", func(t *testing.T) {
		actorCtx := httpx.WithUserID(tenantctx.WithTenant(ctx, tenantctx.Tenant{ID: tenant.ID}), employeeA)
		response, err := mod.Handler.GetStaffAttendanceMyHistory(actorCtx, api.GetStaffAttendanceMyHistoryRequestObject{
			Params: api.GetStaffAttendanceMyHistoryParams{
				From: openapi_types.Date{Time: time.Date(2025, 2, 3, 0, 0, 0, 0, time.UTC)},
				To:   openapi_types.Date{Time: time.Date(2025, 2, 5, 0, 0, 0, 0, time.UTC)},
			},
		})
		require.NoError(t, err)
		saved, ok := response.(api.GetStaffAttendanceMyHistory200JSONResponse)
		require.True(t, ok)
		require.Len(t, saved.Data, 2, "2025-02-03 and 2025-02-04, [from, to) is exclusive of the end date")
		require.Equal(t, "present", string(saved.Data[0].StatusCode), "employeeA's recorded 2025-02-03 arrival must come back as present")
		require.Equal(t, "absent", string(saved.Data[1].StatusCode), "2025-02-04 has no record, so it resolves to absent like every other unrecorded day above")

		// employeeB never recorded anything, but the endpoint still resolves
		// them (computed, not stored) -- it must never leak employeeA's data.
		otherCtx := httpx.WithUserID(tenantctx.WithTenant(ctx, tenantctx.Tenant{ID: tenant.ID}), employeeB)
		otherResponse, err := mod.Handler.GetStaffAttendanceMyHistory(otherCtx, api.GetStaffAttendanceMyHistoryRequestObject{
			Params: api.GetStaffAttendanceMyHistoryParams{
				From: openapi_types.Date{Time: time.Date(2025, 2, 3, 0, 0, 0, 0, time.UTC)},
				To:   openapi_types.Date{Time: time.Date(2025, 2, 5, 0, 0, 0, 0, time.UTC)},
			},
		})
		require.NoError(t, err)
		otherSaved, ok := otherResponse.(api.GetStaffAttendanceMyHistory200JSONResponse)
		require.True(t, ok)
		require.Len(t, otherSaved.Data, 2)
		require.Equal(t, "absent", string(otherSaved.Data[0].StatusCode))
		require.Equal(t, "Citra", otherSaved.Data[0].EmployeeName)
	})
}
