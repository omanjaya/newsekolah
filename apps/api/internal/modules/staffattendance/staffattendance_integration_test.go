package staffattendance

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/staffattendance/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
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

func TestGetAllEmployeesMonthlyRecap(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()

	adminQ := db.New(pg.AdminPool)
	tenant, err := adminQ.CreateTenant(ctx, db.CreateTenantParams{
		Slug: "staff-attendance-test-" + uuid.NewString(), Name: "Staff Attendance Test", EducationLevel: "sma",
		Timezone: "Asia/Jakarta", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)

	mod := Register(Dependencies{Pool: pg.AppPool, Years: stubYears{}, Calendar: stubCalendar{}, Leave: stubLeave{}})

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

	xlsx, err := mod.Service.ExportAllEmployeesMonthlyRecapReport(ctx, tenant.ID, "2025-02", reportdoc.Options{Format: reportdoc.FormatXLSX})
	require.NoError(t, err)
	require.NotEmpty(t, xlsx)

	pdf, err := mod.Service.ExportMonthlyRecapReport(ctx, tenant.ID, employeeA, "2025-02", reportdoc.Options{Format: reportdoc.FormatPDF, ShowLetterhead: true})
	require.NoError(t, err)
	require.NotEmpty(t, pdf)

	// An unknown column key in the caller's selection is rejected rather
	// than silently ignored.
	_, err = mod.Service.ExportMonthlyRecapReport(ctx, tenant.ID, employeeA, "2025-02", reportdoc.Options{
		Format: reportdoc.FormatXLSX, Columns: []reportdoc.ColumnChoice{{Key: "not_a_real_column"}},
	})
	require.ErrorIs(t, err, reportdoc.ErrUnknownColumn)
}
