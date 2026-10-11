package service

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

func date(year int, month time.Month, day int) time.Time {
	return time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
}

// calendarAttendance is an AttendanceReader over a per-student calendar. It
// records the dates it was asked about and answers for any date, including
// the future, so a window that reached past today would be visible.
type calendarAttendance struct {
	days  map[uuid.UUID]func(time.Time) DayOutcome
	asked []time.Time
}

func (c *calendarAttendance) DayStatuses(_ context.Context, _ uuid.UUID, studentIDs []uuid.UUID, dates []time.Time) ([]StudentDayStatus, error) {
	c.asked = append(c.asked, dates...)
	var out []StudentDayStatus
	for _, id := range studentIDs {
		for _, d := range dates {
			out = append(out, StudentDayStatus{StudentUserID: id, Date: d, Outcome: c.days[id](d)})
		}
	}
	return out, nil
}

func (*calendarAttendance) TodaySubmittedCount(context.Context, uuid.UUID) (int, int, error) {
	return 0, 0, nil
}

func isWeekend(d time.Time) bool { return d.Weekday() == time.Saturday || d.Weekday() == time.Sunday }

// weekdays answers outcome on weekdays and no school on weekends.
func weekdays(outcome func(time.Time) DayOutcome) func(time.Time) DayOutcome {
	return func(d time.Time) DayOutcome {
		if isWeekend(d) {
			return DayNoSchool
		}
		return outcome(d)
	}
}

func signalsFor(t *testing.T, policy domain.Policy, today time.Time, calendar func(time.Time) DayOutcome) (domain.Signals, *calendarAttendance) {
	t.Helper()
	id := uuid.New()
	reader := &calendarAttendance{days: map[uuid.UUID]func(time.Time) DayOutcome{id: calendar}}
	svc := &Service{attendance: reader, clock: clock.Frozen{At: today}}
	return svc.buildSignals(context.Background(), uuid.Nil, []uuid.UUID{id}, policy, today)[id], reader
}

func TestAttendanceLookbackDates_AreContiguousAndNeverAfterToday(t *testing.T) {
	for _, today := range []time.Time{date(2026, time.March, 31), date(2026, time.January, 3), date(2026, time.March, 1)} {
		for _, window := range []int{20, 45, 60, 400} {
			dates := attendanceLookbackDates(window, today)

			require.Equal(t, today, dates[0], "the window starts at today")
			require.LessOrEqual(t, len(dates), maxLookbackCalendarDays)
			for i := 1; i < len(dates); i++ {
				require.Equal(t, dates[i-1].AddDate(0, 0, -1), dates[i], "every calendar day exactly once, no month repeated or skipped")
			}
		}
	}
}

// Stepping back one month from the 31st used to land in the same month and
// list its days twice; date arithmetic cannot.
func TestAttendanceLookbackDates_LongWindowFromMonthEndHasNoDuplicates(t *testing.T) {
	dates := attendanceLookbackDates(45, date(2026, time.March, 31))

	seen := map[time.Time]bool{}
	for _, d := range dates {
		require.False(t, seen[d], "%s listed twice", d.Format("2006-01-02"))
		seen[d] = true
	}
	require.Equal(t, date(2026, time.March, 31), dates[0])
	require.Equal(t, date(2026, time.February, 28), dates[31])
	require.Equal(t, date(2026, time.January, 31), dates[59])
}

func TestLocalToday_UsesTheTenantTimezone(t *testing.T) {
	jakarta, err := time.LoadLocation("Asia/Jakarta")
	require.NoError(t, err)
	la, err := time.LoadLocation("America/Los_Angeles")
	require.NoError(t, err)

	late := time.Date(2026, time.March, 15, 20, 0, 0, 0, time.UTC) // 03:00 on the 16th in WIB
	require.Equal(t, date(2026, time.March, 16), localToday(late, jakarta))
	require.Equal(t, date(2026, time.March, 15), localToday(late, time.UTC))

	early := time.Date(2026, time.March, 15, 3, 0, 0, 0, time.UTC) // still the 14th in Los Angeles
	require.Equal(t, date(2026, time.March, 14), localToday(early, la))
	require.Equal(t, date(2026, time.March, 15), localToday(early, time.UTC))
}

// The last school day is read from the tenant's today, not from UTC: a run
// at 20:00 UTC is already the next morning in Jakarta.
func TestAttendance_TimezoneBoundaryDecidesTheLastDay(t *testing.T) {
	policy := domain.DefaultPolicy()
	absentOnMonday16 := weekdays(func(d time.Time) DayOutcome {
		if d.Equal(date(2026, time.March, 16)) {
			return DayAbsent
		}
		return DayNotAbsent
	})
	now := time.Date(2026, time.March, 15, 20, 0, 0, 0, time.UTC) // Sunday evening UTC, Monday morning WIB
	jakarta, err := time.LoadLocation("Asia/Jakarta")
	require.NoError(t, err)

	inUTC, _ := signalsFor(t, policy, localToday(now, time.UTC), absentOnMonday16)
	inJakarta, _ := signalsFor(t, policy, localToday(now, jakarta), absentOnMonday16)

	require.Equal(t, 0, inUTC.AbsentDays, "Monday has not started in UTC")
	require.Equal(t, 1, inJakarta.AbsentDays, "Monday is today in Jakarta")
}

func TestAttendance_AlfaIsTheOnlyAbsence(t *testing.T) {
	policy := domain.DefaultPolicy()
	today := date(2026, time.March, 13) // Friday
	byDay := map[int]DayOutcome{
		13: DayAbsent, 12: DayAbsent, // alfa
		11: DayNotAbsent, // sick, permission, dispensation and present all arrive as this
		10: DayNotAbsent,
	}
	signals, _ := signalsFor(t, policy, today, weekdays(func(d time.Time) DayOutcome {
		if outcome, ok := byDay[d.Day()]; ok && d.Month() == time.March {
			return outcome
		}
		return DayNotAbsent
	}))

	require.True(t, signals.HasAttendance)
	require.Equal(t, 20, signals.ConsideredDays)
	require.Equal(t, 2, signals.AbsentDays)
}

func TestAttendance_FutureDaysAreNeverReadOrCounted(t *testing.T) {
	policy := domain.DefaultPolicy()
	today := date(2026, time.March, 12) // Thursday
	everythingAfterTodayIsAlfa := weekdays(func(d time.Time) DayOutcome {
		if d.After(today) {
			return DayAbsent
		}
		return DayNotAbsent
	})

	signals, reader := signalsFor(t, policy, today, everythingAfterTodayIsAlfa)

	for _, asked := range reader.asked {
		require.False(t, asked.After(today), "%s is in the future", asked.Format("2006-01-02"))
	}
	require.Equal(t, 20, signals.ConsideredDays)
	require.Equal(t, 0, signals.AbsentDays)
}

func TestAttendance_HolidaysAreNotSchoolDaysAndDoNotShrinkTheWindow(t *testing.T) {
	policy := domain.DefaultPolicy()
	today := date(2026, time.March, 13) // Friday
	// 2 to 12 March is a holiday: no scheduled sessions at all.
	holiday := func(d time.Time) bool {
		return !d.Before(date(2026, time.March, 2)) && !d.After(date(2026, time.March, 12))
	}
	signals, _ := signalsFor(t, policy, today, weekdays(func(d time.Time) DayOutcome {
		switch {
		case holiday(d):
			return DayNoSchool
		case d.Equal(date(2026, time.February, 20)):
			return DayAbsent
		}
		return DayNotAbsent
	}))

	// Friday 13 March is the one school day after the holiday (the other
	// 2-12 March weekdays are closed); the other 19 come from before 2 March.
	require.Equal(t, 20, signals.ConsideredDays, "holidays are skipped, not counted")
	require.Equal(t, 1, signals.AbsentDays)
}

func TestAttendance_UnrecordedDaysAreSkippedNotDiluting(t *testing.T) {
	policy := domain.DefaultPolicy()
	today := date(2026, time.March, 13)
	// The latest three school days are not submitted yet; two earlier days were alfa.
	signals, _ := signalsFor(t, policy, today, weekdays(func(d time.Time) DayOutcome {
		switch {
		case d.After(date(2026, time.March, 10)):
			return DayUnrecorded
		case d.Equal(date(2026, time.March, 9)), d.Equal(date(2026, time.March, 6)):
			return DayAbsent
		}
		return DayNotAbsent
	}))

	require.Equal(t, 20, signals.ConsideredDays, "unsubmitted days do not use up places in the window")
	require.Equal(t, 2, signals.AbsentDays)
}

func TestAttendance_FewRecordedDaysGiveASmallerWindow(t *testing.T) {
	policy := domain.DefaultPolicy()
	today := date(2026, time.March, 13)
	signals, _ := signalsFor(t, policy, today, weekdays(func(d time.Time) DayOutcome {
		if d.Before(date(2026, time.March, 9)) {
			return DayNoSchool // enrolled the Monday of this week
		}
		return DayAbsent
	}))

	require.Equal(t, 5, signals.ConsideredDays)
	require.Equal(t, 5, signals.AbsentDays)
}

func TestAttendance_NothingRecordedMeansNoSignal(t *testing.T) {
	signals, _ := signalsFor(t, domain.DefaultPolicy(), date(2026, time.March, 13), weekdays(func(time.Time) DayOutcome { return DayUnrecorded }))

	require.False(t, signals.HasAttendance)
	require.Zero(t, signals.ConsideredDays)
}

// A window longer than a month reaches back across month ends, each school
// day once: 45 weekdays back from Friday 13 March is Monday 12 January.
func TestAttendance_LongWindowSpansMonthsOncePerDay(t *testing.T) {
	policy := domain.DefaultPolicy()
	policy.WindowDays = 45
	today := date(2026, time.March, 13)
	signals, reader := signalsFor(t, policy, today, weekdays(func(d time.Time) DayOutcome {
		if d.Equal(date(2026, time.January, 12)) || d.Equal(date(2026, time.January, 9)) {
			return DayAbsent // the first day is inside the window, the one before it is not
		}
		return DayNotAbsent
	}))

	require.Equal(t, 45, signals.ConsideredDays)
	require.Equal(t, 1, signals.AbsentDays)
	seen := map[time.Time]bool{}
	for _, d := range reader.asked {
		require.False(t, seen[d], "%s asked twice", d.Format("2006-01-02"))
		seen[d] = true
	}
}

// The default policy flags a student with several alfa days in the last 20
// school days: 3 of 20 (15%) is a watch reason, 5 of 20 (25%) an at-risk
// reason. Attendance alone is worth 40 points, the watch level; with a
// second signal the student reaches the at-risk level.
func TestAttendance_SeveralAlfaDaysAreFlaggedUnderTheDefaultPolicy(t *testing.T) {
	policy := domain.DefaultPolicy()
	today := date(2026, time.March, 13)
	alfaOn := func(days ...time.Time) func(time.Time) DayOutcome {
		return weekdays(func(d time.Time) DayOutcome {
			for _, a := range days {
				if d.Equal(a) {
					return DayAbsent
				}
			}
			return DayNotAbsent
		})
	}

	cases := []struct {
		name       string
		alfa       []time.Time
		wantLevel  domain.Level
		wantScore  int
		wantReason []domain.ReasonCode
	}{
		{"no alfa", nil, domain.LevelNone, 0, nil},
		{"two alfa is below watch", []time.Time{date(2026, time.March, 2), date(2026, time.March, 3)}, domain.LevelNone, 0, nil},
		{
			"three alfa is a watch reason",
			[]time.Time{date(2026, time.March, 2), date(2026, time.March, 3), date(2026, time.February, 24)},
			domain.LevelNone, 20, []domain.ReasonCode{domain.ReasonAttendanceWatch},
		},
		{
			"five alfa is an at-risk reason and the watch level",
			[]time.Time{date(2026, time.March, 2), date(2026, time.March, 3), date(2026, time.March, 4), date(2026, time.February, 24), date(2026, time.February, 17)},
			domain.LevelWatch, 40, []domain.ReasonCode{domain.ReasonAttendanceAtRisk},
		},
		{
			"alfa outside the window does not count",
			[]time.Time{date(2026, time.February, 13), date(2026, time.February, 12), date(2026, time.February, 11), date(2026, time.February, 10)},
			domain.LevelNone, 0, nil,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			signals, _ := signalsFor(t, policy, today, alfaOn(tc.alfa...))
			result := domain.Score(signals, policy)

			require.Equal(t, tc.wantLevel, result.Level)
			require.Equal(t, tc.wantScore, result.Score)
			var codes []domain.ReasonCode
			for _, r := range result.Reasons {
				codes = append(codes, r.Code)
			}
			require.Equal(t, tc.wantReason, codes)
		})
	}

	t.Run("five alfa plus two warning letters is at risk", func(t *testing.T) {
		signals, _ := signalsFor(t, policy, today, alfaOn(
			date(2026, time.March, 2), date(2026, time.March, 3), date(2026, time.March, 4), date(2026, time.February, 24), date(2026, time.February, 17)))
		signals.WarningLetterCount = 2
		signals.DisciplinePoints = 50

		require.Equal(t, domain.LevelAtRisk, domain.Score(signals, policy).Level)
	})

	t.Run("sick days alone never flag a student", func(t *testing.T) {
		signals, _ := signalsFor(t, policy, today, weekdays(func(time.Time) DayOutcome { return DayNotAbsent }))
		require.Equal(t, domain.LevelNone, domain.Score(signals, policy).Level)
	})
}
