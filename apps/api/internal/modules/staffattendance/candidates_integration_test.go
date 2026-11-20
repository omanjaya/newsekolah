package staffattendance

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/staffattendance/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/staffattendance/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// TestCandidatesBootstrapAFreshTenant covers the first-schedule deadlock:
// the module's roster only lists people who already have a work schedule,
// so the pickers must read the candidate list instead, which offers every
// active teacher and staff member from the start. A check-in made before
// any schedule exists must still reach the admin's board.
func TestCandidatesBootstrapAFreshTenant(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	q := db.New(pg.AdminPool)
	school, err := q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: "staff-candidates-" + uuid.NewString(), Name: "Candidates", EducationLevel: "sma",
		Timezone: "Asia/Makassar", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)
	newUser := func(name, kind, status string) uuid.UUID {
		user, err := q.CreateUser(ctx, db.CreateUserParams{
			TenantID: school.ID, Username: "u-" + uuid.NewString(), PasswordHash: "x", Name: name, Status: status, Locale: "id",
		})
		require.NoError(t, err)
		if kind != "" {
			require.NoError(t, q.CreateUserProfile(ctx, db.CreateUserProfileParams{UserID: user.ID, TenantID: school.ID, Kind: kind}))
		}
		return user.ID
	}
	teacher := newUser("Guru Contoh", "teacher", "active")
	guard := newUser("Satpam Contoh", "staff", "active")
	student := newUser("Siswa Contoh", "student", "active")
	archived := newUser("Guru Lama", "teacher", "inactive")

	ctx = tenant.WithTenant(ctx, tenant.Tenant{ID: school.ID, Timezone: school.Timezone})
	mod := Register(Dependencies{Pool: pg.AppPool, Years: stubYears{}, Calendar: stubCalendar{}, Leave: stubLeave{}})

	roster, err := mod.Service.ListRoster(ctx, school.ID)
	require.NoError(t, err)
	require.Empty(t, roster, "nobody is on the roster before a schedule exists")

	candidates, err := mod.Service.ListCandidates(ctx, school.ID)
	require.NoError(t, err)
	require.Len(t, candidates, 2)
	require.Equal(t, guard, candidates[1].ID)
	require.Equal(t, teacher, candidates[0].ID)
	require.False(t, candidates[0].HasSchedule)

	// The guard checks in before anyone has given them a schedule.
	loc, err := time.LoadLocation(school.Timezone)
	require.NoError(t, err)
	at := time.Date(2026, 11, 20, 7, 0, 0, 0, loc)
	arrival, err := mod.Service.Scan(clock.WithTime(ctx, at.UTC()), school.ID, guard)
	require.NoError(t, err)
	board, err := mod.Service.GetTodayBoard(clock.WithTime(ctx, at.UTC()), school.ID, nil)
	require.NoError(t, err)
	require.Len(t, board, 1, "an unscheduled check-in still shows on the board")
	require.Equal(t, arrival.RecordID, board[0].RecordID)
	require.Equal(t, "Satpam Contoh", board[0].EmployeeName)

	week := []service.ScheduleDayInput{{Weekday: 1, IsWorkingDay: true, StartMinute: 7 * 60, EndMinute: 15 * 60}}
	_, err = mod.Service.ReplaceWeeklySchedule(ctx, school.ID, teacher, teacher, week)
	require.NoError(t, err)
	for _, ineligible := range []uuid.UUID{student, archived} {
		_, err = mod.Service.ReplaceWeeklySchedule(ctx, school.ID, ineligible, teacher, week)
		require.ErrorIs(t, err, domain.ErrEmployeeNotEligible)
	}

	candidates, err = mod.Service.ListCandidates(ctx, school.ID)
	require.NoError(t, err)
	require.Len(t, candidates, 2)
	require.True(t, candidates[0].HasSchedule, "the teacher now has a schedule")
	require.False(t, candidates[1].HasSchedule)
	roster, err = mod.Service.ListRoster(ctx, school.ID)
	require.NoError(t, err)
	require.Len(t, roster, 1)
	require.Equal(t, teacher, roster[0].ID)
}

// TestScanRefusesDepartureRightAfterArrival: the check-in screen turns its
// arrival button into the departure button in place, so a second tap must
// not close the day seconds after it began.
func TestScanRefusesDepartureRightAfterArrival(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	q := db.New(pg.AdminPool)
	school, err := q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: "staff-departure-" + uuid.NewString(), Name: "Departure", EducationLevel: "sma",
		Timezone: "Asia/Makassar", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)
	employee, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: school.ID, Username: "satpam", PasswordHash: "x", Name: "Satpam", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	ctx = tenant.WithTenant(ctx, tenant.Tenant{ID: school.ID, Timezone: school.Timezone})
	mod := Register(Dependencies{Pool: pg.AppPool, Years: stubYears{}, Calendar: stubCalendar{}, Leave: stubLeave{}})

	loc, err := time.LoadLocation(school.Timezone)
	require.NoError(t, err)
	at := time.Date(2026, 11, 20, 8, 6, 55, 0, loc)
	arrival, err := mod.Service.Scan(clock.WithTime(ctx, at.UTC()), school.ID, employee.ID)
	require.NoError(t, err)

	_, err = mod.Service.Scan(clock.WithTime(ctx, at.Add(2*time.Second).UTC()), school.ID, employee.ID)
	require.ErrorIs(t, err, domain.ErrDepartureTooSoon)
	_, err = mod.Service.Scan(clock.WithTime(ctx, at.Add(domain.MinDepartureGap-time.Second).UTC()), school.ID, employee.ID)
	require.ErrorIs(t, err, domain.ErrDepartureTooSoon)

	departure, err := mod.Service.Scan(clock.WithTime(ctx, at.Add(domain.MinDepartureGap).UTC()), school.ID, employee.ID)
	require.NoError(t, err)
	require.Equal(t, arrival.RecordID, departure.RecordID)
	require.NotNil(t, departure.DepartureAt)
}

// TestAllEmployeesRecapIncludesUnscheduledRecords: a manual entry for
// someone with no work schedule yet shows on the day board, so the
// all-employees monthly recap (and its export) must cover them too, in
// name order alongside the roster.
func TestAllEmployeesRecapIncludesUnscheduledRecords(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	q := db.New(pg.AdminPool)
	school, err := q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: "staff-recap-" + uuid.NewString(), Name: "Recap", EducationLevel: "sma",
		Timezone: "Asia/Makassar", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)
	newStaff := func(name string) uuid.UUID {
		user, err := q.CreateUser(ctx, db.CreateUserParams{
			TenantID: school.ID, Username: "u-" + uuid.NewString(), PasswordHash: "x", Name: name, Status: "active", Locale: "id",
		})
		require.NoError(t, err)
		require.NoError(t, q.CreateUserProfile(ctx, db.CreateUserProfileParams{UserID: user.ID, TenantID: school.ID, Kind: "staff"}))
		return user.ID
	}
	scheduled := newStaff("Bu Rina")
	unscheduledLate := newStaff("Pak Zaenal")
	unscheduledEarly := newStaff("Pak Agus")
	idle := newStaff("Pak Idle")

	ctx = tenant.WithTenant(ctx, tenant.Tenant{ID: school.ID, Timezone: school.Timezone})
	mod := Register(Dependencies{Pool: pg.AppPool, Years: stubYears{}, Calendar: stubCalendar{}, Leave: stubLeave{}})

	week := []service.ScheduleDayInput{{Weekday: 5, IsWorkingDay: true, StartMinute: 7 * 60, EndMinute: 15 * 60}}
	_, err = mod.Service.ReplaceWeeklySchedule(ctx, school.ID, scheduled, scheduled, week)
	require.NoError(t, err)

	loc, err := time.LoadLocation(school.Timezone)
	require.NoError(t, err)
	day := time.Date(2026, 11, 20, 0, 0, 0, 0, time.UTC)
	arrival := time.Date(2026, 11, 20, 7, 10, 0, 0, loc)
	for _, emp := range []uuid.UUID{unscheduledLate, unscheduledEarly} {
		_, err = mod.Service.RecordManual(ctx, school.ID, scheduled, service.EntryInput{
			EmployeeUserID: emp, Date: day, ArrivalAt: &arrival,
		})
		require.NoError(t, err)
	}

	board, err := mod.Service.GetTodayBoard(ctx, school.ID, &day)
	require.NoError(t, err)
	names := make([]string, len(board))
	for i, row := range board {
		names[i] = row.EmployeeName
	}
	require.Equal(t, []string{"Bu Rina", "Pak Agus", "Pak Zaenal"}, names,
		"roster first, then unscheduled records by name")

	recaps, err := mod.Service.GetAllEmployeesMonthlyRecap(ctx, school.ID, "2026-11")
	require.NoError(t, err)
	ids := make([]uuid.UUID, len(recaps))
	for i, r := range recaps {
		ids[i] = r.EmployeeUserID
	}
	require.Equal(t, []uuid.UUID{scheduled, unscheduledEarly, unscheduledLate}, ids,
		"the recap covers the roster and every employee with a record that month, by name")
	require.NotContains(t, ids, idle)

	// A month with no record for them leaves the unscheduled employees out.
	recaps, err = mod.Service.GetAllEmployeesMonthlyRecap(ctx, school.ID, "2026-10")
	require.NoError(t, err)
	require.Len(t, recaps, 1)
	require.Equal(t, scheduled, recaps[0].EmployeeUserID)
}
