package staffattendance

import (
	"bytes"
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"github.com/xuri/excelize/v2"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/staffattendance/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/staffattendance/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// makassarStaff seeds an Asia/Makassar (UTC+8) school with one staff
// member and returns a tenant-scoped context, the employee and the zone.
func makassarStaff(t *testing.T, pg dbtest.Postgres, name string) (context.Context, uuid.UUID, uuid.UUID, *time.Location) {
	t.Helper()
	ctx := context.Background()
	q := db.New(pg.AdminPool)
	school, err := q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: "staff-effective-" + uuid.NewString(), Name: "Effective", EducationLevel: "sma",
		Timezone: "Asia/Makassar", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)
	user, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: school.ID, Username: "u-" + uuid.NewString(), PasswordHash: "x", Name: name, Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	require.NoError(t, q.CreateUserProfile(ctx, db.CreateUserProfileParams{UserID: user.ID, TenantID: school.ID, Kind: "staff"}))
	loc, err := time.LoadLocation(school.Timezone)
	require.NoError(t, err)
	return tenant.WithTenant(ctx, tenant.Tenant{ID: school.ID, Timezone: school.Timezone}), school.ID, user.ID, loc
}

func weekdaysSchedule(startMinute, endMinute, grace int) []service.ScheduleDayInput {
	days := make([]service.ScheduleDayInput, 0, 7)
	for weekday := int16(1); weekday <= 7; weekday++ {
		days = append(days, service.ScheduleDayInput{
			Weekday: weekday, IsWorkingDay: weekday <= 5, StartMinute: startMinute, EndMinute: endMinute, GraceMinutes: grace,
		})
	}
	return days
}

// TestRecapCountsNeitherFutureDaysNorDaysBeforeTheSchedule: a first
// schedule saved on Friday 20 Nov must not turn 2-19 Nov into absences,
// and a recap read that Friday must not report 23-30 Nov, which have not
// happened yet. A record stored for an earlier day is still judged.
func TestRecapCountsNeitherFutureDaysNorDaysBeforeTheSchedule(t *testing.T) {
	pg := dbtest.Start(t)
	ctx, schoolID, employee, loc := makassarStaff(t, pg, "Satpam Contoh")
	mod := Register(Dependencies{Pool: pg.AppPool, Years: stubYears{}, Calendar: stubCalendar{}, Leave: stubLeave{}})

	savedAt := time.Date(2026, 11, 20, 10, 0, 0, 0, loc)
	_, err := mod.Service.ReplaceWeeklySchedule(clock.WithTime(ctx, savedAt), schoolID, employee, employee, weekdaysSchedule(8*60, 16*60, 10))
	require.NoError(t, err)

	// A manual backfill of an earlier day is a real record: it is judged
	// against the schedule now on file.
	arrival := time.Date(2026, 11, 3, 8, 30, 0, 0, loc)
	_, err = mod.Service.RecordManual(ctx, schoolID, employee, service.EntryInput{
		EmployeeUserID: employee, Date: time.Date(2026, 11, 3, 0, 0, 0, 0, time.UTC), ArrivalAt: &arrival,
	})
	require.NoError(t, err)

	readAt := clock.WithTime(ctx, time.Date(2026, 11, 20, 12, 0, 0, 0, loc))
	recap, err := mod.Service.GetMonthlyRecap(readAt, schoolID, employee, "2026-11")
	require.NoError(t, err)
	require.Len(t, recap.Days, 20, "1-20 Nov only: the rest of the month has not happened yet")
	require.Equal(t, "2026-11-20", recap.Days[len(recap.Days)-1].Date.Format("2006-01-02"))
	require.Equal(t, 1, recap.StatusTotals[domain.StatusAbsent], "only the Friday the schedule began on counts as absent")
	require.Equal(t, 1, recap.StatusTotals[domain.StatusLate], "the backfilled 3 Nov arrival is judged")
	require.Equal(t, 18, recap.StatusTotals[domain.StatusUnscheduled], "every other day before the schedule has none")
	require.Equal(t, 20, recap.TotalLateMinutes)

	// The all-staff recap and the history read through the same rule.
	all, err := mod.Service.GetAllEmployeesMonthlyRecap(readAt, schoolID, "2026-11")
	require.NoError(t, err)
	require.Len(t, all, 1)
	require.Equal(t, recap.StatusTotals, all[0].StatusTotals)

	// Read a week later, the schedule is in effect for every weekday since.
	later := clock.WithTime(ctx, time.Date(2026, 11, 27, 12, 0, 0, 0, loc))
	recap, err = mod.Service.GetMonthlyRecap(later, schoolID, employee, "2026-11")
	require.NoError(t, err)
	require.Len(t, recap.Days, 27)
	require.Equal(t, 6, recap.StatusTotals[domain.StatusAbsent], "20 and 23-27 Nov")
	require.Equal(t, 2, recap.StatusTotals[domain.StatusHoliday], "the weekend of 21-22 Nov")

	// A month that has not started yet reports nothing.
	recap, err = mod.Service.GetMonthlyRecap(later, schoolID, employee, "2026-12")
	require.NoError(t, err)
	require.Empty(t, recap.Days)
}

// TestFirstScheduleRejudgesAnUnscheduledCheckIn: a check-in made before
// the employee had any schedule is stored as unscheduled. Saving the
// first schedule judges it at once, so the board, the employee's own
// history and the later departure scan agree instead of the board showing
// "unscheduled" until the departure suddenly flips it to "late". The
// export prints the school's wall-clock times, not UTC.
func TestFirstScheduleRejudgesAnUnscheduledCheckIn(t *testing.T) {
	pg := dbtest.Start(t)
	ctx, schoolID, employee, loc := makassarStaff(t, pg, "Satpam Contoh")
	hub := &fakeRealtimeHub{}
	svc := buildServiceWithRealtime(pg.AppPool, hub)

	// 07:00 in Makassar is still 23:00 the day before in UTC.
	arrivedAt := time.Date(2026, 11, 20, 7, 0, 0, 0, loc)
	arrival, err := svc.Scan(clock.WithTime(ctx, arrivedAt), schoolID, employee)
	require.NoError(t, err)
	require.Equal(t, domain.StatusUnscheduled, arrival.StatusCode)
	require.Len(t, hub.published, 2)

	savedAt := clock.WithTime(ctx, time.Date(2026, 11, 20, 7, 30, 0, 0, loc))
	_, err = svc.ReplaceWeeklySchedule(savedAt, schoolID, employee, employee, weekdaysSchedule(6*60+30, 15*60, 10))
	require.NoError(t, err)
	require.Len(t, hub.published, 4, "the re-judged record refreshes open boards")

	board, err := svc.GetTodayBoard(savedAt, schoolID, nil)
	require.NoError(t, err)
	require.Len(t, board, 1)
	require.Equal(t, arrival.RecordID, board[0].RecordID)
	require.Equal(t, domain.StatusLate, board[0].StatusCode, "the board reflects the schedule as soon as it is saved")
	require.Equal(t, 20, board[0].LateMinutes)

	day := time.Date(2026, 11, 20, 0, 0, 0, 0, time.UTC)
	history, err := svc.GetEmployeeHistory(savedAt, schoolID, employee, day, day.AddDate(0, 0, 1))
	require.NoError(t, err)
	require.Len(t, history, 1)
	require.Equal(t, domain.StatusLate, history[0].StatusCode, "the check-in screen reads the same status")

	departure, err := svc.Scan(clock.WithTime(ctx, time.Date(2026, 11, 20, 15, 5, 0, 0, loc)), schoolID, employee)
	require.NoError(t, err)
	require.Equal(t, arrival.RecordID, departure.RecordID)
	require.Equal(t, domain.StatusLate, departure.StatusCode)
	require.Equal(t, 20, departure.LateMinutes, "the departure does not change the judgement")
	require.Zero(t, departure.EarlyLeaveMinutes)

	// Saving the same schedule again has nothing left to re-judge.
	_, err = svc.ReplaceWeeklySchedule(savedAt, schoolID, employee, employee, weekdaysSchedule(6*60+30, 15*60, 10))
	require.NoError(t, err)
	require.Len(t, hub.published, 6, "only the departure scan published since")

	readAt := clock.WithTime(ctx, time.Date(2026, 11, 20, 16, 0, 0, 0, loc))
	xlsx, err := svc.ExportMonthlyRecapReport(readAt, schoolID, employee, "2026-11", reportdoc.LocaleID, reportdoc.Options{Format: reportdoc.FormatXLSX})
	require.NoError(t, err)
	f, err := excelize.OpenReader(bytes.NewReader(xlsx))
	require.NoError(t, err)
	defer f.Close() //nolint:errcheck
	rows, err := f.GetRows(f.GetSheetList()[0])
	require.NoError(t, err)
	var dayRow, earlierRow []string
	for _, row := range rows {
		for _, cell := range row {
			if cell == "07:00" {
				dayRow = row
			}
			if cell == "Jadwal belum diatur" && earlierRow == nil {
				earlierRow = row
			}
		}
	}
	require.NotNil(t, dayRow, "arrival prints in the school's zone (07:00), not UTC (23:00)")
	require.Contains(t, dayRow, "15:05")
	require.Contains(t, dayRow, "Terlambat")
	require.NotNil(t, earlierRow, "a day before the schedule reads as its label, not the raw code")
	for _, row := range rows {
		require.NotContains(t, row, "unscheduled")
		require.NotContains(t, row, "23:00")
	}
}

// TestFutureMonthRecapKeepsTheEmployeeName: a month that has not started
// has no days, yet its recap and per-employee export still name the
// employee rather than falling back to the raw user ID.
func TestFutureMonthRecapKeepsTheEmployeeName(t *testing.T) {
	pg := dbtest.Start(t)
	ctx, schoolID, employee, loc := makassarStaff(t, pg, "Satpam Contoh")
	mod := Register(Dependencies{Pool: pg.AppPool, Years: stubYears{}, Calendar: stubCalendar{}, Leave: stubLeave{}})

	readAt := clock.WithTime(ctx, time.Date(2026, 11, 20, 12, 0, 0, 0, loc))
	_, err := mod.Service.ReplaceWeeklySchedule(readAt, schoolID, employee, employee, weekdaysSchedule(8*60, 16*60, 10))
	require.NoError(t, err)

	recap, err := mod.Service.GetMonthlyRecap(readAt, schoolID, employee, "2027-01")
	require.NoError(t, err)
	require.Empty(t, recap.Days)
	require.Equal(t, "Satpam Contoh", recap.EmployeeName)

	xlsx, err := mod.Service.ExportMonthlyRecapReport(readAt, schoolID, employee, "2027-01", reportdoc.LocaleID, reportdoc.Options{Format: reportdoc.FormatXLSX})
	require.NoError(t, err)
	f, err := excelize.OpenReader(bytes.NewReader(xlsx))
	require.NoError(t, err)
	defer f.Close() //nolint:errcheck
	require.Equal(t, []string{"Satpam Contoh"}, f.GetSheetList(), "the sheet is titled with the name, not the UUID")
	rows, err := f.GetRows(f.GetSheetList()[0])
	require.NoError(t, err)
	foundName := false
	for _, row := range rows {
		for _, cell := range row {
			require.NotContains(t, cell, employee.String())
			if cell == "Satpam Contoh" {
				foundName = true
			}
		}
	}
	require.True(t, foundName, "the scope line names the employee")
}

// TestEnablingAnOffWeekdayIsNotRetroactive: the editor stores all seven
// weekdays on the first save, so Saturday already has an "off" row. Turning
// Saturday on later must date it as a working day from that save: earlier
// Saturdays were the employee's configured days off, so they stay holidays
// -- neither absences nor "no schedule" (staff-attendance-R1).
func TestEnablingAnOffWeekdayIsNotRetroactive(t *testing.T) {
	pg := dbtest.Start(t)
	ctx, schoolID, employee, loc := makassarStaff(t, pg, "Satpam Contoh")
	mod := Register(Dependencies{Pool: pg.AppPool, Years: stubYears{}, Calendar: stubCalendar{}, Leave: stubLeave{}})

	firstSave := clock.WithTime(ctx, time.Date(2026, 11, 2, 7, 0, 0, 0, loc))
	_, err := mod.Service.ReplaceWeeklySchedule(firstSave, schoolID, employee, employee, weekdaysSchedule(8*60, 16*60, 10))
	require.NoError(t, err)

	withSaturday := weekdaysSchedule(8*60, 16*60, 10)
	withSaturday[5].IsWorkingDay = true
	secondSave := clock.WithTime(ctx, time.Date(2026, 11, 20, 12, 0, 0, 0, loc))
	_, err = mod.Service.ReplaceWeeklySchedule(secondSave, schoolID, employee, employee, withSaturday)
	require.NoError(t, err)

	// Saving the same week again keeps Saturday dated from the second save.
	_, err = mod.Service.ReplaceWeeklySchedule(clock.WithTime(ctx, time.Date(2026, 11, 25, 12, 0, 0, 0, loc)), schoolID, employee, employee, withSaturday)
	require.NoError(t, err)

	readAt := clock.WithTime(ctx, time.Date(2026, 11, 28, 18, 0, 0, 0, loc))
	recap, err := mod.Service.GetMonthlyRecap(readAt, schoolID, employee, "2026-11")
	require.NoError(t, err)
	require.Len(t, recap.Days, 28)
	statusOn := func(day int) domain.StatusCode {
		return recap.Days[day-1].StatusCode
	}
	require.Equal(t, domain.StatusHoliday, statusOn(7), "Saturday 7 Nov was a day off then")
	require.Equal(t, domain.StatusHoliday, statusOn(14), "Saturday 14 Nov was a day off then")
	require.Equal(t, domain.StatusAbsent, statusOn(21), "Saturday is a working day from 20 Nov")
	require.Equal(t, domain.StatusAbsent, statusOn(28))
	require.Equal(t, domain.StatusAbsent, statusOn(9), "Monday keeps the date of the first save")
	require.Equal(t, domain.StatusHoliday, statusOn(8), "Sunday stays off")
	require.Equal(t, domain.StatusUnscheduled, statusOn(1), "1 Nov is before any schedule")
	require.Equal(t, 1, recap.StatusTotals[domain.StatusUnscheduled], "only 1 Nov has no schedule")

	// Turning Saturday off and on again adds a version from each switch and
	// rewrites none of the earlier ones.
	_, err = mod.Service.ReplaceWeeklySchedule(clock.WithTime(ctx, time.Date(2026, 11, 26, 12, 0, 0, 0, loc)), schoolID, employee, employee, weekdaysSchedule(8*60, 16*60, 10))
	require.NoError(t, err)
	days, err := mod.Service.ReplaceWeeklySchedule(clock.WithTime(ctx, time.Date(2026, 11, 27, 12, 0, 0, 0, loc)), schoolID, employee, employee, withSaturday)
	require.NoError(t, err)
	require.Equal(t, time.Date(2026, 11, 27, 0, 0, 0, 0, time.UTC), days[5].EffectiveFrom, "Saturday works again from 27 Nov")
	require.Equal(t, time.Date(2026, 11, 2, 0, 0, 0, 0, time.UTC), days[0].EffectiveFrom, "Monday keeps its first version")
	recap, err = mod.Service.GetMonthlyRecap(readAt, schoolID, employee, "2026-11")
	require.NoError(t, err)
	require.Equal(t, domain.StatusHoliday, recap.Days[13].StatusCode, "Saturday 14 Nov is still the day off it was")
	require.Equal(t, domain.StatusAbsent, recap.Days[20].StatusCode, "Saturday 21 Nov is still the working day it was")
	require.Equal(t, domain.StatusAbsent, recap.Days[27].StatusCode, "Saturday 28 Nov is a working day again")
}

// TestDisablingAWorkingWeekdayIsNotRetroactive: Saturday has been a
// working day since Wednesday 25 Nov, so Saturday 28 Nov with no record is
// an absence. Turning Saturday off on Monday 30 Nov applies from that day
// on: 28 Nov stays an absence, and a record entered for it later is still
// judged against the working Saturday it was (r4v-attendance-R1).
func TestDisablingAWorkingWeekdayIsNotRetroactive(t *testing.T) {
	pg := dbtest.Start(t)
	ctx, schoolID, employee, loc := makassarStaff(t, pg, "Sabtu Kerja")
	mod := Register(Dependencies{Pool: pg.AppPool, Years: stubYears{}, Calendar: stubCalendar{}, Leave: stubLeave{}})

	withSaturday := weekdaysSchedule(8*60, 16*60, 10)
	withSaturday[5].IsWorkingDay = true
	_, err := mod.Service.ReplaceWeeklySchedule(clock.WithTime(ctx, time.Date(2026, 11, 25, 9, 0, 0, 0, loc)), schoolID, employee, employee, withSaturday)
	require.NoError(t, err)

	recapAt := func(at time.Time) service.MonthlyRecap {
		t.Helper()
		recap, err := mod.Service.GetMonthlyRecap(clock.WithTime(ctx, at), schoolID, employee, "2026-11")
		require.NoError(t, err)
		require.Len(t, recap.Days, 30)
		return recap
	}
	before := recapAt(time.Date(2026, 11, 30, 7, 0, 0, 0, loc))
	require.Equal(t, domain.StatusAbsent, before.Days[27].StatusCode, "Saturday 28 Nov is a working day with no record")
	require.Equal(t, 5, before.StatusTotals[domain.StatusAbsent])
	require.Equal(t, 1, before.StatusTotals[domain.StatusHoliday])
	require.Equal(t, 24, before.StatusTotals[domain.StatusUnscheduled])

	turnedOffAt := clock.WithTime(ctx, time.Date(2026, 11, 30, 10, 0, 0, 0, loc))
	days, err := mod.Service.ReplaceWeeklySchedule(turnedOffAt, schoolID, employee, employee, weekdaysSchedule(8*60, 16*60, 10))
	require.NoError(t, err)
	require.False(t, days[5].IsWorkingDay)

	after := recapAt(time.Date(2026, 11, 30, 10, 0, 0, 0, loc))
	require.Equal(t, domain.StatusAbsent, after.Days[27].StatusCode, "Saturday 28 Nov was a working day then")
	require.Equal(t, before.StatusTotals, after.StatusTotals, "turning Saturday off rewrites no earlier day")

	// The editor reads the week as it stands now: Saturday is off.
	week, err := mod.Service.GetWeeklySchedule(turnedOffAt, schoolID, employee)
	require.NoError(t, err)
	require.Len(t, week, 7)
	require.False(t, week[5].IsWorkingDay)

	// A record entered for 28 Nov after the change is judged by the
	// Saturday in effect on 28 Nov: 08:30 is 20 minutes past the grace.
	arrival := time.Date(2026, 11, 28, 8, 30, 0, 0, loc)
	entry, err := mod.Service.RecordManual(turnedOffAt, schoolID, employee, service.EntryInput{
		EmployeeUserID: employee, Date: time.Date(2026, 11, 28, 0, 0, 0, 0, time.UTC), ArrivalAt: &arrival,
	})
	require.NoError(t, err)
	require.Equal(t, domain.StatusLate, entry.StatusCode)
	require.Equal(t, 20, entry.LateMinutes)

	// The next Saturday, after the change, is a day off.
	december, err := mod.Service.GetMonthlyRecap(clock.WithTime(ctx, time.Date(2026, 12, 5, 18, 0, 0, 0, loc)), schoolID, employee, "2026-12")
	require.NoError(t, err)
	require.Len(t, december.Days, 5)
	require.Equal(t, domain.StatusAbsent, december.Days[3].StatusCode, "Friday 4 Dec is still a working day")
	require.Equal(t, domain.StatusHoliday, december.Days[4].StatusCode, "Saturday 5 Dec is off")
}

// TestWeekdayTurnedOffAndOnAgainKeepsItsOffPeriod: Saturday works from the
// first save on 2 Nov, is turned off on Monday 9 Nov and on again on
// Monday 23 Nov. Each Saturday is judged by the version in effect on it:
// worked on 7 and 28 Nov, off on 14 and 21 Nov.
func TestWeekdayTurnedOffAndOnAgainKeepsItsOffPeriod(t *testing.T) {
	pg := dbtest.Start(t)
	ctx, schoolID, employee, loc := makassarStaff(t, pg, "Sabtu Berganti")
	mod := Register(Dependencies{Pool: pg.AppPool, Years: stubYears{}, Calendar: stubCalendar{}, Leave: stubLeave{}})

	withSaturday := weekdaysSchedule(8*60, 16*60, 10)
	withSaturday[5].IsWorkingDay = true
	saveOn := func(day int, week []service.ScheduleDayInput) {
		t.Helper()
		_, err := mod.Service.ReplaceWeeklySchedule(clock.WithTime(ctx, time.Date(2026, 11, day, 9, 0, 0, 0, loc)), schoolID, employee, employee, week)
		require.NoError(t, err)
	}
	saveOn(2, withSaturday)
	saveOn(9, weekdaysSchedule(8*60, 16*60, 10))
	saveOn(16, weekdaysSchedule(8*60, 16*60, 10))
	saveOn(23, withSaturday)

	recap, err := mod.Service.GetMonthlyRecap(clock.WithTime(ctx, time.Date(2026, 11, 30, 18, 0, 0, 0, loc)), schoolID, employee, "2026-11")
	require.NoError(t, err)
	require.Len(t, recap.Days, 30)
	statusOn := func(day int) domain.StatusCode {
		return recap.Days[day-1].StatusCode
	}
	require.Equal(t, domain.StatusUnscheduled, statusOn(1), "1 Nov is before any schedule")
	require.Equal(t, domain.StatusAbsent, statusOn(7), "Saturday 7 Nov was a working day")
	require.Equal(t, domain.StatusHoliday, statusOn(14), "Saturday 14 Nov was off")
	require.Equal(t, domain.StatusHoliday, statusOn(21), "Saturday 21 Nov was off")
	require.Equal(t, domain.StatusAbsent, statusOn(28), "Saturday 28 Nov is a working day again")
	require.Equal(t, domain.StatusHoliday, statusOn(8), "Sunday stays off")
	require.Equal(t, domain.StatusAbsent, statusOn(9), "Monday works throughout")
	require.Equal(t, 23, recap.StatusTotals[domain.StatusAbsent], "21 weekdays plus Saturday 7 and 28 Nov")
	require.Equal(t, 6, recap.StatusTotals[domain.StatusHoliday], "four Sundays and the two Saturdays that were off")
	require.Equal(t, 1, recap.StatusTotals[domain.StatusUnscheduled])
}
