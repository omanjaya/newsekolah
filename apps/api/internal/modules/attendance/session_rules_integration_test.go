package attendance

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/events"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// TestSessionRefusesLessonsThatHaveNotStarted: attendance cannot be
// recorded before the lesson begins (tenant time zone, simulated clock),
// and a session on a later day cannot even be opened, so a teacher
// browsing ahead can no longer mark absences that flow into homeroom and
// the reports.
func TestSessionRefusesLessonsThatHaveNotStarted(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	svc := buildService(pg.AppPool)
	w := seedWorld(t, ctx, pg.AdminPool, "not-started")
	_, err := pg.AdminPool.Exec(ctx, `update periods set starts_at = '08:00' where id = $1`, w.periodID)
	require.NoError(t, err)

	actor := service.Actor{UserID: w.teacherID}
	before := clock.WithTime(ctx, w.today.Add(7*time.Hour))
	during := clock.WithTime(ctx, w.today.Add(8*time.Hour+30*time.Minute))

	_, err = svc.OpenSession(before, w.tenantID, actor, w.scheduleTodayID, w.today.AddDate(0, 0, 7), domain.SaveModeNormal)
	require.ErrorIs(t, err, domain.ErrSessionNotStarted, "a lesson next week cannot be opened")

	opened, err := svc.OpenSession(before, w.tenantID, actor, w.scheduleTodayID, w.today, domain.SaveModeNormal)
	require.NoError(t, err, "today's lesson can be opened to look at the roster")
	require.True(t, opened.StartsAt.Equal(w.today.Add(8*time.Hour)), "starts_at is the first period's start")

	input := service.SaveEntriesInput{Entries: []service.SaveEntryInput{{StudentUserID: w.student1ID, StatusCode: "A"}}}
	_, err = svc.SaveEntries(before, w.tenantID, actor, opened.Session.ID, input)
	require.ErrorIs(t, err, domain.ErrSessionNotStarted)
	corrector := service.Actor{UserID: w.otherTeacherID, IsGlobalCorrector: true}
	_, err = svc.SaveEntries(before, w.tenantID, corrector, opened.Session.ID, service.SaveEntriesInput{
		Mode: domain.SaveModeCorrection, Reason: "x", Entries: input.Entries,
	})
	require.ErrorIs(t, err, domain.ErrSessionNotStarted, "correction mode has the same lower bound")

	saved, err := svc.SaveEntries(during, w.tenantID, actor, opened.Session.ID, input)
	require.NoError(t, err)
	require.NotNil(t, saved.Session.SubmittedAt)

	sessions, err := svc.ListSessions(before, w.tenantID, w.teacherID, service.ListSessionsOptions{Date: &w.today})
	require.NoError(t, err)
	require.Len(t, sessions, 1)
	require.True(t, sessions[0].StartsAt.Equal(w.today.Add(8*time.Hour)), "the list carries starts_at too")
}

// TestOwnerResavesSubmittedSessionInNormalMode: the session's own teacher
// is told to keep saving in normal mode after the first save (a subject
// teacher who is not the homeroom teacher may not use correction mode),
// while someone correcting another teacher's lesson is told correction.
func TestOwnerResavesSubmittedSessionInNormalMode(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	svc := buildService(pg.AppPool)
	w := seedWorld(t, ctx, pg.AdminPool, "owner-resave")
	// The owner is not the homeroom teacher here.
	_, err := pg.AdminPool.Exec(ctx, `delete from duty_assignments where tenant_id = $1`, w.tenantID)
	require.NoError(t, err)

	owner := service.Actor{UserID: w.teacherID}
	opened, err := svc.OpenSession(ctx, w.tenantID, owner, w.scheduleTodayID, w.today, domain.SaveModeNormal)
	require.NoError(t, err)
	require.Equal(t, domain.SaveModeNormal, opened.SaveMode)

	saved, err := svc.SaveEntries(ctx, w.tenantID, owner, opened.Session.ID, service.SaveEntriesInput{
		Entries: []service.SaveEntryInput{{StudentUserID: w.student1ID, StatusCode: "H"}},
	})
	require.NoError(t, err)
	require.Equal(t, domain.SaveModeNormal, saved.SaveMode)

	reopened, err := svc.GetSessionDetail(ctx, w.tenantID, owner, opened.Session.ID)
	require.NoError(t, err)
	require.NotNil(t, reopened.Session.SubmittedAt)
	require.Equal(t, domain.SaveModeNormal, reopened.SaveMode, "the owner re-saves a submitted session in normal mode")

	_, err = svc.SaveEntries(ctx, w.tenantID, owner, opened.Session.ID, service.SaveEntriesInput{
		Mode: domain.SaveModeCorrection, Reason: "salah tekan",
		Entries: []service.SaveEntryInput{{StudentUserID: w.student1ID, StatusCode: "S"}},
	})
	require.ErrorIs(t, err, domain.ErrCorrectionNotAllowed, "correction mode stays reserved for correctors")
	_, err = svc.SaveEntries(ctx, w.tenantID, owner, opened.Session.ID, service.SaveEntriesInput{
		Entries: []service.SaveEntryInput{{StudentUserID: w.student1ID, StatusCode: "S"}},
	})
	require.NoError(t, err, "the mode the API told the owner to use succeeds")

	viewer := service.Actor{UserID: w.otherTeacherID, CanViewAll: true, IsGlobalCorrector: true}
	other, err := svc.GetSessionDetail(ctx, w.tenantID, viewer, opened.Session.ID)
	require.NoError(t, err)
	require.Equal(t, domain.SaveModeCorrection, other.SaveMode)
}

// stubOverrider decides student's status for every date, the way an
// issued leave letter does.
type stubOverrider struct {
	NoOpOverrider
	student uuid.UUID
	code    string
}

func (o stubOverrider) Override(_ context.Context, _ uuid.UUID, studentID uuid.UUID, _ time.Time) (string, domain.EntrySource, bool, error) {
	if studentID == o.student {
		return o.code, domain.SourceLeave, true, nil
	}
	return "", "", false, nil
}

func buildServiceWithOverrider(pool *pgxpool.Pool, overrider Overrider) *service.Service {
	schoolModule := school.Register(pool, tenant.ModeSingle, nil)
	schedulingModule := scheduling.Register(pool, events.NewBus(), noopPerms{})
	return service.New(
		pool, repository.New(pool), schoolModule.Service, schedulingModule.ScheduleReader, schedulingModule.AccessChecker, schedulingModule.JournalService,
		NoOpBlocker{}, overrider, NoOpViolationRecorder{}, NoOpDisciplineReader{}, nil, nil, nil,
	)
}

// TestLeaveLetterLocksTheRowAndReportsAnOverride: a student covered by an
// issued leave letter shows the letter's status as a locked row, and a
// save that asked for something else says whose status it kept instead
// of reporting a plain success.
func TestLeaveLetterLocksTheRowAndReportsAnOverride(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedWorld(t, ctx, pg.AdminPool, "leave-lock")
	svc := buildServiceWithOverrider(pg.AppPool, stubOverrider{student: w.student2ID, code: "S"})
	actor := service.Actor{UserID: w.teacherID}

	opened, err := svc.OpenSession(ctx, w.tenantID, actor, w.scheduleTodayID, w.today, domain.SaveModeNormal)
	require.NoError(t, err)
	for _, item := range opened.Roster {
		if item.StudentUserID == w.student2ID {
			require.True(t, item.Locked)
			require.Equal(t, "S", item.CurrentStatus)
			require.Equal(t, domain.SourceLeave, item.Source)
		} else {
			require.False(t, item.Locked)
		}
	}

	saved, err := svc.SaveEntries(ctx, w.tenantID, actor, opened.Session.ID, service.SaveEntriesInput{
		Entries: []service.SaveEntryInput{
			{StudentUserID: w.student1ID, StatusCode: "H"},
			{StudentUserID: w.student2ID, StatusCode: "H"},
		},
	})
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{w.student2ID}, saved.OverriddenStudentIDs)

	saved, err = svc.SaveEntries(ctx, w.tenantID, actor, opened.Session.ID, service.SaveEntriesInput{
		Entries: []service.SaveEntryInput{
			{StudentUserID: w.student1ID, StatusCode: "H"},
			{StudentUserID: w.student2ID, StatusCode: "S"},
		},
	})
	require.NoError(t, err)
	require.Empty(t, saved.OverriddenStudentIDs, "sending the letter's own status overrides nothing")
}

// TestMeetingNumberCountsHeldLessonsOfTheClassSubject: the meeting number
// counts this class and subject's lessons that were actually held, on
// every weekday, and a session merely opened by browsing does not count;
// the previous topic is the last journal of the class and subject.
func TestMeetingNumberCountsHeldLessonsOfTheClassSubject(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	svc := buildService(pg.AppPool)
	w := seedWorld(t, ctx, pg.AdminPool, "meeting-number")
	_, err := pg.AdminPool.Exec(ctx,
		`insert into teaching_assignments (tenant_id, academic_year_id, teacher_user_id, subject_id, class_id) values ($1, $2, $3, $4, $5)`,
		w.tenantID, w.yearID, w.teacherID, w.subjectID, w.classID)
	require.NoError(t, err)
	actor := service.Actor{UserID: w.teacherID}

	// Lessons one and two weeks ago on today's weekday, opened by
	// browsing only.
	for _, weeks := range []int{1, 2} {
		_, err = svc.OpenSession(ctx, w.tenantID, actor, w.scheduleTodayID, w.today.AddDate(0, 0, -7*weeks), domain.SaveModeNormal)
		require.NoError(t, err)
	}

	// Yesterday's lesson, on a different weekday's schedule row, was held.
	yesterday, err := svc.OpenSession(ctx, w.tenantID, actor, w.scheduleYesterdayID, w.yesterday, domain.SaveModeNormal)
	require.NoError(t, err)
	_, err = svc.SaveEntries(ctx, w.tenantID, actor, yesterday.Session.ID, service.SaveEntriesInput{
		Entries: []service.SaveEntryInput{{StudentUserID: w.student1ID, StatusCode: "H"}},
		Journal: &service.SaveJournalInput{Topic: "Persamaan kuadrat", Activities: "Latihan soal"},
	})
	require.NoError(t, err)

	today, err := svc.OpenSession(ctx, w.tenantID, actor, w.scheduleTodayID, w.today, domain.SaveModeNormal)
	require.NoError(t, err)
	require.Equal(t, 2, today.MeetingNumber, "yesterday's held lesson counts; the browsed ones do not")
	require.Equal(t, "Persamaan kuadrat", today.PreviousJournalTopic)
}

// TestFillCountIgnoresStudentsWhoLeftTheClass: an entry kept for a student
// who has since left the class does not count toward "filled".
func TestFillCountIgnoresStudentsWhoLeftTheClass(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	svc := buildService(pg.AppPool)
	w := seedWorld(t, ctx, pg.AdminPool, "fill-count-left")
	actor := service.Actor{UserID: w.teacherID}

	opened, err := svc.OpenSession(ctx, w.tenantID, actor, w.scheduleTodayID, w.today, domain.SaveModeNormal)
	require.NoError(t, err)
	_, err = svc.SaveEntries(ctx, w.tenantID, actor, opened.Session.ID, service.SaveEntriesInput{
		Entries: []service.SaveEntryInput{{StudentUserID: w.student2ID, StatusCode: "D"}},
	})
	require.NoError(t, err)
	_, err = pg.AdminPool.Exec(ctx,
		`update enrollments set status = 'left', left_on = current_date where tenant_id = $1 and student_user_id = $2`,
		w.tenantID, w.student2ID)
	require.NoError(t, err)

	sessions, err := svc.ListSessions(ctx, w.tenantID, w.teacherID, service.ListSessionsOptions{Date: &w.today})
	require.NoError(t, err)
	require.Len(t, sessions, 1)
	require.Equal(t, 1, sessions[0].RosterCount)
	require.Equal(t, 0, sessions[0].EnteredCount, "the remaining student is still unrecorded")
}

// TestCalendarDoesNotCountFutureDaysAsIncomplete: days after today have
// not happened, so they are neither listed nor totalled as "Belum
// lengkap".
func TestCalendarDoesNotCountFutureDaysAsIncomplete(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	svc := buildService(pg.AppPool)
	w := seedWorld(t, ctx, pg.AdminPool, "calendar-future")

	month := w.today.Format("2006-01")
	mid := time.Date(w.today.Year(), w.today.Month(), 10, 12, 0, 0, 0, time.UTC)
	days, totals, err := svc.GetMonthlySummary(clock.WithTime(ctx, mid), w.tenantID, w.student1ID, month)
	require.NoError(t, err)

	incomplete := 0
	for _, day := range days {
		if day.Date.Day() > 10 {
			require.Equal(t, domain.StatusNone, day.StatusCode, day.Date.Format(time.DateOnly))
			require.True(t, day.Complete)
			continue
		}
		if day.StatusCode == domain.StatusIncomplete {
			incomplete++
		}
	}
	require.Positive(t, incomplete, "past scheduled days with nothing recorded are still incomplete")
	require.Equal(t, incomplete, totals[domain.StatusIncomplete])
}
