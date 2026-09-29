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

func TestSimulatedStaffScanUsesSchoolDayAndTime(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	q := db.New(pg.AdminPool)
	school, err := q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: "sim-staff-" + uuid.NewString(), Name: "Simulation", EducationLevel: "sma",
		Timezone: "Asia/Makassar", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)
	employee, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: school.ID, Username: "tester", PasswordHash: "x", Name: "Tester", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	ctx = tenant.WithTenant(ctx, tenant.Tenant{ID: school.ID, Timezone: school.Timezone})
	mod := Register(Dependencies{Pool: pg.AppPool, Years: stubYears{}, Calendar: stubCalendar{}, Leave: stubLeave{}})
	_, err = mod.Service.ReplaceWeeklySchedule(ctx, school.ID, employee.ID, employee.ID, []service.ScheduleDayInput{
		{Weekday: 1, IsWorkingDay: true, StartMinute: 7 * 60, EndMinute: 15 * 60},
	})
	require.NoError(t, err)
	loc, err := time.LoadLocation(school.Timezone)
	require.NoError(t, err)
	at := time.Date(2026, 9, 28, 7, 30, 0, 0, loc)
	simCtx := clock.WithTime(ctx, at.UTC()) // UTC is still Sunday.
	arrival, err := mod.Service.Scan(simCtx, school.ID, employee.ID)
	require.NoError(t, err)
	require.Equal(t, "2026-09-28", arrival.Date.Format("2006-01-02"))
	require.True(t, at.Equal(*arrival.ArrivalAt))
	require.Equal(t, domain.StatusLate, arrival.StatusCode)
	require.Equal(t, 30, arrival.LateMinutes)

	board, err := mod.Service.GetTodayBoard(simCtx, school.ID, nil)
	require.NoError(t, err)
	require.Len(t, board, 1)
	require.Equal(t, arrival.RecordID, board[0].RecordID)
	departure, err := mod.Service.Scan(clock.WithTime(ctx, at.Add(7*time.Hour)), school.ID, employee.ID)
	require.NoError(t, err)
	require.Equal(t, arrival.RecordID, departure.RecordID)
	require.Equal(t, 30, departure.EarlyLeaveMinutes)
	require.Equal(t, 30, departure.LateMinutes)
	_, err = mod.Service.Scan(simCtx, school.ID, employee.ID)
	require.ErrorIs(t, err, domain.ErrAlreadyScannedBothWays)
}
