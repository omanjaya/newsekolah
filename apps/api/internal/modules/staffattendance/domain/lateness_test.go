package domain_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/staffattendance/domain"
)

func dayTime(dateStr, hhmm string) time.Time {
	t, err := time.Parse("2006-01-02 15:04", dateStr+" "+hhmm)
	if err != nil {
		panic(err)
	}
	return t
}

func TestComputeLateness_Present(t *testing.T) {
	sched := &domain.ScheduleDay{IsWorkingDay: true, StartMinute: 8 * 60, EndMinute: 16 * 60, GraceMinutes: 10}
	arrival := dayTime("2026-03-02", "07:55")
	departure := dayTime("2026-03-02", "16:05")
	result := domain.ComputeLateness(domain.LatenessInput{
		Date: dayTime("2026-03-02", "00:00"), Schedule: sched, IsWorkingDay: true,
		ArrivalAt: &arrival, DepartureAt: &departure,
	})
	require.Equal(t, domain.StatusPresent, result.StatusCode)
	require.Zero(t, result.LateMinutes)
	require.Zero(t, result.EarlyLeaveMinutes)
}

func TestComputeLateness_LateArrival(t *testing.T) {
	sched := &domain.ScheduleDay{IsWorkingDay: true, StartMinute: 8 * 60, EndMinute: 16 * 60, GraceMinutes: 10}
	arrival := dayTime("2026-03-02", "08:25")
	result := domain.ComputeLateness(domain.LatenessInput{
		Date: dayTime("2026-03-02", "00:00"), Schedule: sched, IsWorkingDay: true,
		ArrivalAt: &arrival,
	})
	require.Equal(t, domain.StatusLate, result.StatusCode)
	// Grace ends at 08:10; arrival at 08:25 is 15 minutes past that.
	require.Equal(t, 15, result.LateMinutes)
}

func TestComputeLateness_ArrivalAtGraceBoundaryIsNotLate(t *testing.T) {
	sched := &domain.ScheduleDay{IsWorkingDay: true, StartMinute: 8 * 60, EndMinute: 16 * 60, GraceMinutes: 10}
	arrival := dayTime("2026-03-02", "08:10")
	result := domain.ComputeLateness(domain.LatenessInput{
		Date: dayTime("2026-03-02", "00:00"), Schedule: sched, IsWorkingDay: true,
		ArrivalAt: &arrival,
	})
	require.Equal(t, domain.StatusPresent, result.StatusCode)
	require.Zero(t, result.LateMinutes)
}

func TestComputeLateness_EarlyDeparture(t *testing.T) {
	sched := &domain.ScheduleDay{IsWorkingDay: true, StartMinute: 8 * 60, EndMinute: 16 * 60, GraceMinutes: 0}
	arrival := dayTime("2026-03-02", "08:00")
	departure := dayTime("2026-03-02", "15:30")
	result := domain.ComputeLateness(domain.LatenessInput{
		Date: dayTime("2026-03-02", "00:00"), Schedule: sched, IsWorkingDay: true,
		ArrivalAt: &arrival, DepartureAt: &departure,
	})
	require.Equal(t, domain.StatusPresent, result.StatusCode)
	require.Equal(t, 30, result.EarlyLeaveMinutes)
}

func TestComputeLateness_AbsentWhenNothingRecorded(t *testing.T) {
	sched := &domain.ScheduleDay{IsWorkingDay: true, StartMinute: 8 * 60, EndMinute: 16 * 60}
	result := domain.ComputeLateness(domain.LatenessInput{
		Date: dayTime("2026-03-02", "00:00"), Schedule: sched, IsWorkingDay: true,
	})
	require.Equal(t, domain.StatusAbsent, result.StatusCode)
}

func TestComputeLateness_IncompleteWhenOnlyDepartureRecorded(t *testing.T) {
	sched := &domain.ScheduleDay{IsWorkingDay: true, StartMinute: 8 * 60, EndMinute: 16 * 60}
	departure := dayTime("2026-03-02", "16:00")
	result := domain.ComputeLateness(domain.LatenessInput{
		Date: dayTime("2026-03-02", "00:00"), Schedule: sched, IsWorkingDay: true,
		DepartureAt: &departure,
	})
	require.Equal(t, domain.StatusIncomplete, result.StatusCode)
}

// The calendar taking priority over a configured schedule is the core
// requirement for a school-observed holiday: an employee who happens to
// show up on a day the academic calendar marks as non-working must not be
// scored against a shift that was never expected to run.
func TestComputeLateness_CalendarNonWorkingDayOverridesSchedule(t *testing.T) {
	sched := &domain.ScheduleDay{IsWorkingDay: true, StartMinute: 8 * 60, EndMinute: 16 * 60, GraceMinutes: 0}
	arrival := dayTime("2026-03-02", "10:00") // would be very late, if the day counted
	result := domain.ComputeLateness(domain.LatenessInput{
		Date: dayTime("2026-03-02", "00:00"), Schedule: sched, IsWorkingDay: false,
		ArrivalAt: &arrival,
	})
	require.Equal(t, domain.StatusHoliday, result.StatusCode)
	require.Zero(t, result.LateMinutes)
}

// No schedule row at all is a configuration gap, not a day off: it must
// read as Unscheduled, never Holiday, even on a day the calendar itself
// counts as a working day -- this is exactly the case that used to make
// an employee's check-in screen say "Libur" on an ordinary Thursday
// simply because nobody had set up their weekly schedule yet.
func TestComputeLateness_NoScheduleForWeekdayIsUnscheduled(t *testing.T) {
	result := domain.ComputeLateness(domain.LatenessInput{
		Date: dayTime("2026-03-02", "00:00"), Schedule: nil, IsWorkingDay: true,
	})
	require.Equal(t, domain.StatusUnscheduled, result.StatusCode)
}

// A missing schedule on a day the calendar also marks non-working is
// still Unscheduled, not Holiday: OnLeave aside, Unscheduled is checked
// before IsWorkingDay precisely so the two failure modes never collapse
// into one ambiguous status.
func TestComputeLateness_NoScheduleOnNonWorkingCalendarDayIsStillUnscheduled(t *testing.T) {
	result := domain.ComputeLateness(domain.LatenessInput{
		Date: dayTime("2026-03-02", "00:00"), Schedule: nil, IsWorkingDay: false,
	})
	require.Equal(t, domain.StatusUnscheduled, result.StatusCode)
}

func TestComputeLateness_ScheduleMarkedNonWorkingIsHoliday(t *testing.T) {
	sched := &domain.ScheduleDay{IsWorkingDay: false}
	result := domain.ComputeLateness(domain.LatenessInput{
		Date: dayTime("2026-03-02", "00:00"), Schedule: sched, IsWorkingDay: true,
	})
	require.Equal(t, domain.StatusHoliday, result.StatusCode)
}

// Leave removes the expectation outright, even on what would otherwise be
// a working day with a configured schedule and no arrival recorded.
func TestComputeLateness_OnLeaveOverridesEverything(t *testing.T) {
	sched := &domain.ScheduleDay{IsWorkingDay: true, StartMinute: 8 * 60, EndMinute: 16 * 60}
	result := domain.ComputeLateness(domain.LatenessInput{
		Date: dayTime("2026-03-02", "00:00"), Schedule: sched, IsWorkingDay: true, OnLeave: true,
	})
	require.Equal(t, domain.StatusOnLeave, result.StatusCode)
	require.Zero(t, result.LateMinutes)
	require.Zero(t, result.EarlyLeaveMinutes)
}

// A shift crossing midnight (22:00-06:00): on-time arrival at the shift's
// start and on-time departure the next calendar morning must both read as
// zero lateness, proving the expected end is anchored to the day after
// Date rather than compared naively within the same 24 hours.
func TestComputeLateness_NightShiftCrossingMidnightOnTime(t *testing.T) {
	sched := &domain.ScheduleDay{IsWorkingDay: true, StartMinute: 22 * 60, EndMinute: 6 * 60, GraceMinutes: 5}
	arrival := dayTime("2026-03-02", "22:00")
	departure := dayTime("2026-03-03", "06:00") // next calendar day
	result := domain.ComputeLateness(domain.LatenessInput{
		Date: dayTime("2026-03-02", "00:00"), Schedule: sched, IsWorkingDay: true,
		ArrivalAt: &arrival, DepartureAt: &departure,
	})
	require.Equal(t, domain.StatusPresent, result.StatusCode)
	require.Zero(t, result.LateMinutes)
	require.Zero(t, result.EarlyLeaveMinutes)
}

func TestComputeLateness_NightShiftCrossingMidnightLateAndEarlyLeave(t *testing.T) {
	sched := &domain.ScheduleDay{IsWorkingDay: true, StartMinute: 22 * 60, EndMinute: 6 * 60, GraceMinutes: 5}
	arrival := dayTime("2026-03-02", "22:20")   // 15 minutes past the 22:05 grace cutoff
	departure := dayTime("2026-03-03", "05:30") // 30 minutes before the 06:00 next-day end
	result := domain.ComputeLateness(domain.LatenessInput{
		Date: dayTime("2026-03-02", "00:00"), Schedule: sched, IsWorkingDay: true,
		ArrivalAt: &arrival, DepartureAt: &departure,
	})
	require.Equal(t, domain.StatusLate, result.StatusCode)
	require.Equal(t, 15, result.LateMinutes)
	require.Equal(t, 30, result.EarlyLeaveMinutes)
}
