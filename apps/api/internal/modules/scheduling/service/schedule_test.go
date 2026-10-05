package service

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
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

// TestFilterByDay covers the helper ListByClass/ListByTeacher now use to
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
