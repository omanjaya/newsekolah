package service

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
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
	require.NoError(t, before.enforceTeacherWindow(context.Background(), uuid.New(), sched, before.now()))

	after := &Service{repo: repo, clock: clock.Frozen{At: deadline.Add(time.Hour)}}
	err := after.enforceTeacherWindow(context.Background(), uuid.New(), sched, after.now())
	require.ErrorIs(t, err, domain.ErrTeacherEditDeadline)
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
