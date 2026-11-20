package service

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// fakeScheduleRepo embeds the (nil) Repository interface so it satisfies
// every method a given test does not call. yearArchived and settingValue
// drive resolveCandidate and enforceTeacherWindow respectively; period is
// what GetPeriodRef returns for any period id.
type fakeScheduleRepo struct {
	Repository
	yearArchived bool
	settingValue string
	settingFound bool
	period       PeriodRef
}

func (f fakeScheduleRepo) IsYearArchived(context.Context, uuid.UUID, uuid.UUID) (bool, error) {
	return f.yearArchived, nil
}

func (f fakeScheduleRepo) GetTenantSettingValue(context.Context, uuid.UUID, string) (string, bool, error) {
	return f.settingValue, f.settingFound, nil
}

func (f fakeScheduleRepo) GetPeriodRef(context.Context, uuid.UUID, uuid.UUID) (PeriodRef, error) {
	return f.period, nil
}

// TestResolveCandidateRejectsArchivedYear proves resolveCandidate checks
// IsYearArchived first and returns ErrYearArchived without going on to
// resolve periods, school days, or the teaching assignment -- an archived
// year must block new/updated schedules the same way it blocks new
// classes and enrollments in the academic module.
func TestResolveCandidateRejectsArchivedYear(t *testing.T) {
	svc := &Service{repo: fakeScheduleRepo{yearArchived: true}, clock: clock.Real{}}

	_, err := svc.resolveCandidate(context.Background(), uuid.New(), ScheduleInput{
		AcademicYearID: uuid.New(), StartPeriodID: uuid.New(), EndPeriodID: uuid.New(),
	})
	require.ErrorIs(t, err, domain.ErrYearArchived)
}

// TestEnforceTeacherWindowAbsoluteDeadline covers the RFC3339 form of
// schedule.teacher_edit_deadline -- the old app's single-cutoff setting
// ("fill in your schedule before the semester starts"): editing is allowed
// strictly before that instant and refused at or after it.
func TestEnforceTeacherWindowAbsoluteDeadline(t *testing.T) {
	deadline := time.Date(2026, 9, 20, 0, 0, 0, 0, time.UTC)
	repo := fakeScheduleRepo{settingFound: true, settingValue: deadline.Format(time.RFC3339)}
	sched := domain.Schedule{StartPeriodID: uuid.New(), DayOfWeek: 1}

	before := &Service{repo: repo, clock: clock.Frozen{At: deadline.Add(-time.Hour)}}
	require.NoError(t, before.enforceTeacherWindow(context.Background(), uuid.New(), sched, before.now(context.Background())))

	after := &Service{repo: repo, clock: clock.Frozen{At: deadline.Add(time.Hour)}}
	err := after.enforceTeacherWindow(context.Background(), uuid.New(), sched, after.now(context.Background()))
	require.ErrorIs(t, err, domain.ErrTeacherEditDeadline)
}

func TestSimulatedTeacherWindowUsesSchoolTimezone(t *testing.T) {
	ctx := tenant.WithTenant(context.Background(), tenant.Tenant{Timezone: "Asia/Makassar"})
	loc, err := time.LoadLocation("Asia/Makassar")
	require.NoError(t, err)
	start := time.Date(2026, 9, 28, 6, 0, 0, 0, loc)
	svc := &Service{
		repo: fakeScheduleRepo{settingFound: true, settingValue: "1h", period: PeriodRef{
			StartsAt: time.Date(0, 1, 1, 8, 0, 0, 0, time.UTC),
		}},
		clock: clock.Frozen{At: start.UTC()},
	}
	sched := domain.Schedule{StartPeriodID: uuid.New(), DayOfWeek: 1}
	require.NoError(t, svc.enforceTeacherWindow(ctx, uuid.New(), sched, svc.now(ctx)))
	simCtx := clock.WithTime(ctx, start.Add(90*time.Minute).UTC())
	require.Equal(t, time.Monday, svc.now(simCtx).Weekday())
	require.Equal(t, 7, svc.now(simCtx).Hour())
	require.ErrorIs(t, svc.enforceTeacherWindow(simCtx, uuid.New(), sched, svc.now(simCtx)), domain.ErrTeacherEditDeadline)
	require.NoError(t, svc.enforceTeacherWindow(ctx, uuid.New(), sched, svc.now(ctx)), "simulation must not mutate the injected clock")
}

// TestEnforceTeacherWindowDurationDeadline covers the current rolling
// per-occurrence form: a schedule may not be touched inside its last
// `deadline` before the lesson occurs next.
func TestEnforceTeacherWindowDurationDeadline(t *testing.T) {
	// A Monday 10:00 period, referenced by a date-agnostic wall-clock time
	// per PeriodRef's own doc comment.
	period := PeriodRef{StartsAt: time.Date(0, 1, 1, 10, 0, 0, 0, time.UTC)}
	sched := domain.Schedule{StartPeriodID: uuid.New(), DayOfWeek: 1} // Monday

	t.Run("outside the window, edit is allowed", func(t *testing.T) {
		repo := fakeScheduleRepo{settingFound: true, settingValue: "1m", period: period}
		// Monday 08:00, lesson at Monday 10:00, 1-minute deadline: well outside it.
		now := time.Date(2026, 9, 14, 8, 0, 0, 0, time.UTC)
		svc := &Service{repo: repo, clock: clock.Frozen{At: now}}
		require.NoError(t, svc.enforceTeacherWindow(context.Background(), uuid.New(), sched, now))
	})

	t.Run("inside the window, edit is refused", func(t *testing.T) {
		repo := fakeScheduleRepo{settingFound: true, settingValue: "2h", period: period}
		// Monday 09:00, lesson at Monday 10:00, 2-hour deadline: inside it.
		now := time.Date(2026, 9, 14, 9, 0, 0, 0, time.UTC)
		svc := &Service{repo: repo, clock: clock.Frozen{At: now}}
		err := svc.enforceTeacherWindow(context.Background(), uuid.New(), sched, now)
		require.ErrorIs(t, err, domain.ErrTeacherEditDeadline)
	})

	t.Run("no setting configured falls back to the default 24h window", func(t *testing.T) {
		repo := fakeScheduleRepo{settingFound: false, period: period}
		// Monday 08:00, lesson at Monday 10:00: inside the default 24h window.
		now := time.Date(2026, 9, 14, 8, 0, 0, 0, time.UTC)
		svc := &Service{repo: repo, clock: clock.Frozen{At: now}}
		err := svc.enforceTeacherWindow(context.Background(), uuid.New(), sched, now)
		require.ErrorIs(t, err, domain.ErrTeacherEditDeadline)
	})
}

// TestFilterByDay covers the helper ListBlocks uses to
// combine their own filter with an optional day_of_week: a nil day leaves
// every schedule in place (single-filter behaviour, unchanged), and a
// given day narrows to exactly the matching rows -- this is what makes
// GET /v1/schedules?class_id=...&day_of_week=... return one day instead
// of the whole week once both filters are supplied together.
func TestFilterByDay(t *testing.T) {
	monday := domain.Schedule{ID: uuid.New(), DayOfWeek: 1}
	tuesday := domain.Schedule{ID: uuid.New(), DayOfWeek: 2}
	wednesday := domain.Schedule{ID: uuid.New(), DayOfWeek: 3}
	schedules := []domain.Schedule{monday, tuesday, wednesday}

	require.Equal(t, schedules, filterByDay(schedules, nil))

	day := int16(2)
	filtered := filterByDay(schedules, &day)
	require.Len(t, filtered, 1)
	require.Equal(t, tuesday.ID, filtered[0].ID)

	noMatch := int16(7)
	require.Empty(t, filterByDay(schedules, &noMatch))
}

// fakeYearRepo answers GetAcademicYearRef for the as_of clamping tests.
type fakeYearRepo struct {
	Repository
	year AcademicYearRef
}

func (f fakeYearRepo) GetAcademicYearRef(context.Context, uuid.UUID, uuid.UUID) (AcademicYearRef, error) {
	return f.year, nil
}

func date(value string) time.Time {
	d, err := time.Parse(time.DateOnly, value)
	if err != nil {
		panic(err)
	}
	return d
}

// A timetable read without as_of shows today's week in the school's time
// zone; any as_of is moved into the academic year, so a read before it
// starts shows its first week and one after it ends its last.
func TestAsOfDefaultsToTodayAndIsClampedToTheYear(t *testing.T) {
	year := AcademicYearRef{StartsOn: date("2026-07-13"), EndsOn: date("2027-06-30")}
	// 23:30 UTC on Thursday 19 November is already Friday 20 November in
	// Asia/Makassar.
	svc := &Service{repo: fakeYearRepo{year: year}, clock: clock.Frozen{At: time.Date(2026, 11, 19, 23, 30, 0, 0, time.UTC)}}
	ctx := tenant.WithTenant(context.Background(), tenant.Tenant{Timezone: "Asia/Makassar"})

	got, err := svc.asOfInYear(ctx, uuid.New(), uuid.New(), nil)
	require.NoError(t, err)
	require.Equal(t, date("2026-11-20"), got)

	before := date("2026-01-05")
	got, err = svc.asOfInYear(ctx, uuid.New(), uuid.New(), &before)
	require.NoError(t, err)
	require.Equal(t, year.StartsOn, got)

	after := date("2027-08-01")
	got, err = svc.asOfInYear(ctx, uuid.New(), uuid.New(), &after)
	require.NoError(t, err)
	require.Equal(t, year.EndsOn, got)

	simulated := clock.WithTime(ctx, time.Date(2027, 2, 1, 1, 0, 0, 0, time.UTC))
	got, err = svc.asOfInYear(simulated, uuid.New(), uuid.New(), nil)
	require.NoError(t, err)
	require.Equal(t, date("2027-02-01"), got, "the time simulation moves today")
}

// Only a schedule manager may date a change; a teacher's self-service
// write is refused before anything is read.
func TestEffectiveFromIsAdminOnly(t *testing.T) {
	svc := &Service{clock: clock.Real{}}
	teacher := Actor{UserID: uuid.New()}
	from := date("2026-11-23")
	in := ScheduleInput{AcademicYearID: uuid.New(), EffectiveFrom: &from}
	ctx := context.Background()

	_, err := svc.CreateSchedule(ctx, uuid.New(), in, teacher)
	require.ErrorIs(t, err, domain.ErrEffectiveDateAdminOnly)
	_, err = svc.UpdateScheduleBlock(ctx, uuid.New(), uuid.New(), []uuid.UUID{uuid.New()}, in, teacher)
	require.ErrorIs(t, err, domain.ErrEffectiveDateAdminOnly)
	require.ErrorIs(t, svc.DeleteScheduleBlock(ctx, uuid.New(), uuid.New(), []uuid.UUID{uuid.New()}, &from, teacher), domain.ErrEffectiveDateAdminOnly)
	require.ErrorIs(t, svc.ClearAcademicYear(ctx, uuid.New(), uuid.New(), &from, teacher), domain.ErrEffectiveDateAdminOnly)
}

func TestEffectiveDatesStayInsideTheYear(t *testing.T) {
	year := AcademicYearRef{StartsOn: date("2026-07-15"), EndsOn: date("2027-06-30")}
	require.ErrorIs(t, requireInYear(year, date("2026-07-14")), domain.ErrEffectiveFromOutOfYear)
	require.ErrorIs(t, requireInYear(year, date("2027-07-01")), domain.ErrEffectiveFromOutOfYear)
	require.NoError(t, requireInYear(year, date("2027-06-30")))

	// Before the year starts, a lesson without a date starts with it: the
	// year's first date on the lesson's weekday.
	period := PeriodRef{StartsAt: time.Date(0, 1, 1, 7, 0, 0, 0, time.UTC)}
	svc := &Service{repo: fakeScheduleRepo{period: period}, clock: clock.Frozen{At: time.Date(2026, 7, 1, 3, 0, 0, 0, time.UTC)}}
	ctx := context.Background()
	monday := domain.Schedule{DayOfWeek: 1}
	start, err := svc.startDate(ctx, uuid.New(), year, monday, nil)
	require.NoError(t, err)
	require.Equal(t, date("2026-07-20"), start, "the year starts on a Wednesday; its first Monday is the 20th")
	start, err = svc.startDate(ctx, uuid.New(), year, domain.Schedule{DayOfWeek: 3}, nil)
	require.NoError(t, err)
	require.Equal(t, date("2026-07-15"), start)

	// A Thursday lesson from Wednesday 30 June 2027 would start after the
	// year ends.
	last := date("2027-06-30")
	_, err = svc.startDate(ctx, uuid.New(), year, domain.Schedule{DayOfWeek: 4}, &last)
	require.ErrorIs(t, err, domain.ErrEffectiveFromOutOfYear)
	// An explicit date before today is how a manager enters weeks already
	// taught.
	early := date("2026-07-15")
	svc.clock = clock.Frozen{At: time.Date(2026, 11, 20, 3, 0, 0, 0, time.UTC)}
	start, err = svc.startDate(ctx, uuid.New(), year, monday, &early)
	require.NoError(t, err)
	require.Equal(t, date("2026-07-20"), start)
}

// Mid-year, a lesson added without a date starts on its first date from
// the school's today on, never over weeks already taught; one whose
// lesson today has already begun starts the next week.
func TestStartDateDefaultsToToday(t *testing.T) {
	year := AcademicYearRef{StartsOn: date("2026-07-13"), EndsOn: date("2027-06-30")}
	period := PeriodRef{StartsAt: time.Date(0, 1, 1, 7, 0, 0, 0, time.UTC)}
	// 23:30 UTC on Wednesday 25 November is 07:30 on Thursday 26 November
	// in Asia/Makassar.
	svc := &Service{repo: fakeScheduleRepo{period: period}, clock: clock.Frozen{At: time.Date(2026, 11, 25, 23, 30, 0, 0, time.UTC)}}
	ctx := tenant.WithTenant(context.Background(), tenant.Tenant{Timezone: "Asia/Makassar"})

	start, err := svc.startDate(ctx, uuid.New(), year, domain.Schedule{DayOfWeek: 1}, nil)
	require.NoError(t, err)
	require.Equal(t, date("2026-11-30"), start, "the next Monday, not the year's first")
	start, err = svc.startDate(ctx, uuid.New(), year, domain.Schedule{DayOfWeek: 5}, nil)
	require.NoError(t, err)
	require.Equal(t, date("2026-11-27"), start)
	start, err = svc.startDate(ctx, uuid.New(), year, domain.Schedule{DayOfWeek: 4}, nil)
	require.NoError(t, err)
	require.Equal(t, date("2026-12-03"), start, "today's 07:00 lesson is already under way")

	svc.clock = clock.Frozen{At: time.Date(2026, 11, 25, 22, 30, 0, 0, time.UTC)} // 06:30 WITA
	start, err = svc.startDate(ctx, uuid.New(), year, domain.Schedule{DayOfWeek: 4}, nil)
	require.NoError(t, err)
	require.Equal(t, date("2026-11-26"), start, "today's lesson has not begun yet")

	// After the year has ended there is no date left to start on.
	svc.clock = clock.Frozen{At: time.Date(2027, 7, 5, 3, 0, 0, 0, time.UTC)}
	_, err = svc.startDate(ctx, uuid.New(), year, domain.Schedule{DayOfWeek: 1}, nil)
	require.ErrorIs(t, err, domain.ErrEffectiveFromOutOfYear)
}

// The database's guards reach callers as the errors the service's own
// checks return: the named exclusion constraints as the two conflicts, the
// range history guard as a too-early change, the in-effect trigger as an
// ended lesson.
func TestMapConstraintError(t *testing.T) {
	cases := []struct {
		err  *pgconn.PgError
		want error
	}{
		{&pgconn.PgError{Code: "23P01", ConstraintName: "ex_schedules_teacher_slot"}, domain.ErrConflictTeacher},
		{&pgconn.PgError{Code: "23P01", ConstraintName: "ex_schedules_class_slot"}, domain.ErrConflictClass},
		{&pgconn.PgError{Code: "23503", ConstraintName: "schedule_history_guard"}, domain.ErrScheduleHasHistory},
		{&pgconn.PgError{Code: "23503", ConstraintName: "attendance_sessions_schedule_id_fkey"}, domain.ErrScheduleHasHistory},
		{&pgconn.PgError{Code: "23503", ConstraintName: "schedule_history_range"}, domain.ErrScheduleChangeBeforeHistory},
		{&pgconn.PgError{Code: "23514", ConstraintName: "schedule_in_effect"}, domain.ErrScheduleEnded},
	}
	for _, tc := range cases {
		require.ErrorIs(t, mapConstraintError(tc.err), tc.want, tc.err.ConstraintName)
	}
}

// A manager may change a lesson with history from its earliest date on,
// never one that has ended or whose remaining dates are all bound.
func TestManagerPolicy(t *testing.T) {
	today := date("2026-11-20")
	require.Equal(t, MutationPolicy{CanEdit: true, CanDelete: true}, managerPolicy(nil, false, today, today))

	earliest := date("2026-11-27")
	policy := managerPolicy(nil, true, earliest, today)
	require.True(t, policy.CanEdit)
	require.True(t, policy.RequiresEffectiveFrom)
	require.Equal(t, earliest, *policy.MinEffectiveFrom)

	ended := date("2026-11-19")
	policy = managerPolicy(&ended, true, today, today)
	require.False(t, policy.CanEdit)
	require.ErrorIs(t, policy.Reason, domain.ErrScheduleEnded)
	policy = managerPolicy(&ended, false, today, today)
	require.False(t, policy.CanEdit, "an ended version is locked with or without history")
	require.ErrorIs(t, policy.Reason, domain.ErrScheduleEnded)

	bound := date("2026-11-26")
	policy = managerPolicy(&bound, true, earliest, today)
	require.False(t, policy.CanDelete, "every remaining date is bound by history")
	require.ErrorIs(t, policy.Reason, domain.ErrScheduleChangeBeforeHistory, "still on the timetable, so not ended")
}
