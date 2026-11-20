package activities_test

import (
	"context"
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/activities/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/activities/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/activities/service"
	transporthttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/activities/transport/http"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

type fixedYear struct{ id uuid.UUID }

func (y fixedYear) GetActiveAcademicYearID(context.Context, uuid.UUID) (uuid.UUID, bool, error) {
	return y.id, true, nil
}

type staticPerms struct{ set authz.Set }

func (p staticPerms) EffectivePermissions(context.Context, uuid.UUID, uuid.UUID) (authz.Set, error) {
	return p.set, nil
}

type fixedClock struct{ now time.Time }

func (c fixedClock) Now() time.Time { return c.now }

var _ clock.Clock = fixedClock{}

func requireStatus(t *testing.T, err error, status int) {
	t.Helper()
	var appErr *httpx.Error
	require.True(t, errors.As(err, &appErr), "want an *httpx.Error, got %v", err)
	require.Equal(t, status, appErr.Status)
}

// TestCoachRunsOwnClubOnly: a club's coach (pembina) was decorative, every
// club route needed view_activities, so a teacher coach got 403 on their
// own club. A teacher now holds record_extracurricular_attendance, scoped
// by the service to the clubs they coach: the coach lists, opens and runs
// meetings of their club, and nothing of another.
func TestCoachRunsOwnClubOnly(t *testing.T) {
	ctx := context.Background()
	pg := dbtest.Start(t)
	insertID := func(sql string, args ...any) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, pg.AdminPool.QueryRow(ctx, sql+" returning id", args...).Scan(&id))
		return id
	}
	tenant := insertID(`insert into tenants (slug,name,education_level,timezone,locale,status,plan) values ('activities-coach','Test','sma','UTC','id','active','default')`)
	year := insertID(`insert into academic_years (tenant_id,label,starts_on,ends_on) values ($1,'2026/2027','2026-01-01','2027-12-31')`, tenant)
	student := insertID(`insert into users (tenant_id,username,password_hash,name,status,locale) values ($1,'student','x','Student','active','id')`, tenant)
	coach := insertID(`insert into users (tenant_id,username,password_hash,name,status,locale) values ($1,'coach','x','Coach','active','id')`, tenant)
	otherTeacher := insertID(`insert into users (tenant_id,username,password_hash,name,status,locale) values ($1,'other','x','Other','active','id')`, tenant)

	svc := service.New(pg.AppPool, repository.New(pg.AppPool), fixedYear{id: year}, nil)
	admin := domain.Viewer{UserID: uuid.New(), AllClubs: true}
	club, err := svc.CreateExtracurricular(ctx, tenant, service.ExtracurricularInput{
		Name: "Pramuka", CoachUserID: uuid.NullUUID{UUID: coach, Valid: true}, IsActive: true,
	})
	require.NoError(t, err)
	_, err = svc.CreateExtracurricular(ctx, tenant, service.ExtracurricularInput{Name: "Paskibra", IsActive: true})
	require.NoError(t, err)
	_, err = svc.JoinClub(ctx, tenant, club.ID, student, time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC))
	require.NoError(t, err)

	asCoach := domain.Viewer{UserID: coach}
	asOther := domain.Viewer{UserID: otherTeacher}

	all, err := svc.ListExtracurriculars(ctx, tenant, admin, false)
	require.NoError(t, err)
	require.Len(t, all, 2)
	mine, err := svc.ListExtracurriculars(ctx, tenant, asCoach, false)
	require.NoError(t, err)
	require.Len(t, mine, 1)
	require.Equal(t, club.ID, mine[0].ID)
	none, err := svc.ListExtracurriculars(ctx, tenant, asOther, false)
	require.NoError(t, err)
	require.Empty(t, none)

	_, err = svc.GetExtracurricular(ctx, tenant, asCoach, club.ID)
	require.NoError(t, err)
	members, err := svc.ListMembers(ctx, tenant, asCoach, club.ID, false)
	require.NoError(t, err)
	require.Len(t, members, 1)
	meeting, err := svc.CreateMeeting(ctx, tenant, asCoach, club.ID, time.Date(2026, 11, 20, 0, 0, 0, 0, time.UTC), "")
	require.NoError(t, err)
	_, err = svc.RecordAttendance(ctx, tenant, asCoach, meeting.ID, student, domain.StatusPresent, "")
	require.NoError(t, err)
	roster, err := svc.MeetingRosterFor(ctx, tenant, asCoach, meeting.ID)
	require.NoError(t, err)
	require.Len(t, roster.Entries, 1)
	require.Equal(t, domain.StatusPresent, roster.Entries[0].StatusCode)
	require.Equal(t, coach, roster.Entries[0].RecordedBy.UUID)

	_, err = svc.GetExtracurricular(ctx, tenant, asOther, club.ID)
	require.ErrorIs(t, err, domain.ErrNotClubCoach)
	_, err = svc.ListMeetings(ctx, tenant, asOther, club.ID)
	require.ErrorIs(t, err, domain.ErrNotClubCoach)
	_, err = svc.CreateMeeting(ctx, tenant, asOther, club.ID, time.Date(2026, 11, 27, 0, 0, 0, 0, time.UTC), "")
	require.ErrorIs(t, err, domain.ErrNotClubCoach)
	_, err = svc.RecordAttendance(ctx, tenant, asOther, meeting.ID, student, domain.StatusSick, "")
	require.ErrorIs(t, err, domain.ErrNotClubCoach)
	_, err = svc.AttendanceReport(ctx, tenant, asOther, club.ID)
	require.ErrorIs(t, err, domain.ErrNotClubCoach)

	// Through the handler with the teacher role's permission only.
	h := transporthttp.New(svc, staticPerms{set: authz.NewSet(authz.PermRecordExtracurricularAttendance)})
	coachCtx := httpx.WithUserID(httpx.WithTenantID(ctx, tenant), coach)
	otherCtx := httpx.WithUserID(httpx.WithTenantID(ctx, tenant), otherTeacher)
	list, err := h.ListExtracurriculars(coachCtx, api.ListExtracurricularsRequestObject{})
	require.NoError(t, err)
	require.Len(t, list.(api.ListExtracurriculars200JSONResponse).Data, 1)
	_, err = h.GetExtracurricular(otherCtx, api.GetExtracurricularRequestObject{ClubId: club.ID})
	requireStatus(t, err, http.StatusForbidden)

	// Staff with view_activities read a student's memberships (profile).
	memberships, err := h.ListStudentClubMemberships(coachCtx, api.ListStudentClubMembershipsRequestObject{StudentId: student})
	require.NoError(t, err)
	require.Len(t, memberships.(api.ListStudentClubMemberships200JSONResponse).Data, 1)
}

// TestStudentOwnActivitiesAndDuplicateParticipant: a student saw no
// activity they take part in nor their achievements (the only reads were
// view_activities, every student's data). /v1/me/activities and
// /v1/me/achievements are scoped to the caller. Adding the same
// participant twice answered 400 INVALID_PARTICIPANT ("must be one class,
// one grade level or one student"); it is a 409 conflict of its own now.
func TestStudentOwnActivitiesAndDuplicateParticipant(t *testing.T) {
	ctx := context.Background()
	pg := dbtest.Start(t)
	insertID := func(sql string, args ...any) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, pg.AdminPool.QueryRow(ctx, sql+" returning id", args...).Scan(&id))
		return id
	}
	tenant := insertID(`insert into tenants (slug,name,education_level,timezone,locale,status,plan) values ('activities-own','Test','sma','UTC','id','active','default')`)
	year := insertID(`insert into academic_years (tenant_id,label,starts_on,ends_on) values ($1,'2026/2027','2026-01-01','2027-12-31')`, tenant)
	grade := insertID(`insert into grade_levels (tenant_id,code,name,sequence) values ($1,'X','Kelas X',10)`, tenant)
	otherGrade := insertID(`insert into grade_levels (tenant_id,code,name,sequence) values ($1,'XI','Kelas XI',11)`, tenant)
	class := insertID(`insert into classes (tenant_id,academic_year_id,grade_level_id,name) values ($1,$2,$3,'X-A')`, tenant, year, grade)
	otherClass := insertID(`insert into classes (tenant_id,academic_year_id,grade_level_id,name) values ($1,$2,$3,'XI-A')`, tenant, year, otherGrade)
	student := insertID(`insert into users (tenant_id,username,password_hash,name,status,locale) values ($1,'siswa','x','Siswa','active','id')`, tenant)
	classmate := insertID(`insert into users (tenant_id,username,password_hash,name,status,locale) values ($1,'siswa2','x','Siswa Dua','active','id')`, tenant)
	insertID(`insert into enrollments (tenant_id,academic_year_id,student_user_id,class_id,joined_on) values ($1,$2,$3,$4,'2026-07-01')`, tenant, year, student, class)

	now := time.Date(2026, 11, 20, 3, 0, 0, 0, time.UTC)
	svc := service.New(pg.AppPool, repository.New(pg.AppPool), fixedYear{id: year}, fixedClock{now: now})
	newActivity := func(name string, start, end time.Time) uuid.UUID {
		t.Helper()
		a, err := svc.CreateActivity(ctx, tenant, service.ActivityInput{Name: name, StartDate: start, EndDate: end})
		require.NoError(t, err)
		return a.ID
	}
	day := func(d int) time.Time { return time.Date(2026, 11, d, 0, 0, 0, 0, time.UTC) }
	byName := newActivity("Lomba siswa", day(25), day(25))
	byClass := newActivity("Kunjungan kelas", day(26), day(26))
	byGrade := newActivity("Persami", day(28), day(29))
	ended := newActivity("Sudah lewat", day(10), day(11))
	notMine := newActivity("Kelas lain", day(27), day(27))

	add := func(activity uuid.UUID, p domain.Participant) error {
		_, err := svc.AddParticipant(ctx, tenant, activity, p)
		return err
	}
	require.NoError(t, add(byName, domain.Participant{StudentID: uuid.NullUUID{UUID: student, Valid: true}}))
	require.NoError(t, add(byClass, domain.Participant{ClassID: uuid.NullUUID{UUID: class, Valid: true}}))
	require.NoError(t, add(byGrade, domain.Participant{GradeLevelID: uuid.NullUUID{UUID: grade, Valid: true}}))
	require.NoError(t, add(ended, domain.Participant{StudentID: uuid.NullUUID{UUID: student, Valid: true}}))
	require.NoError(t, add(notMine, domain.Participant{ClassID: uuid.NullUUID{UUID: otherClass, Valid: true}}))
	require.NoError(t, add(notMine, domain.Participant{StudentID: uuid.NullUUID{UUID: classmate, Valid: true}}))

	// The same class twice: a conflict, not a malformed participant.
	err := add(byClass, domain.Participant{ClassID: uuid.NullUUID{UUID: class, Valid: true}})
	require.ErrorIs(t, err, domain.ErrParticipantExists)

	mine, err := svc.ListMyActivities(ctx, tenant, student, time.UTC)
	require.NoError(t, err)
	got := make([]uuid.UUID, len(mine))
	for i, a := range mine {
		got[i] = a.ID
	}
	require.Equal(t, []uuid.UUID{byName, byClass, byGrade}, got)

	_, err = svc.CreateAchievement(ctx, tenant, domain.Achievement{
		StudentUserID: student, CompetitionName: "Lomba Pionering", Level: domain.AchievementLevel("city"),
		Placing: "Juara 1", AchievedOn: day(15),
	})
	require.NoError(t, err)
	_, err = svc.CreateAchievement(ctx, tenant, domain.Achievement{
		StudentUserID: classmate, CompetitionName: "OSN", Level: domain.AchievementLevel("national"),
		Placing: "Emas", AchievedOn: day(16),
	})
	require.NoError(t, err)

	h := transporthttp.New(svc, nil)
	studentCtx := httpx.WithUserID(httpx.WithTenantID(ctx, tenant), student)
	achievements, err := h.ListMyAchievements(studentCtx, api.ListMyAchievementsRequestObject{})
	require.NoError(t, err)
	data := achievements.(api.ListMyAchievements200JSONResponse).Data
	require.Len(t, data, 1)
	require.Equal(t, "Lomba Pionering", data[0].CompetitionName)
	events, err := h.ListMyActivityEvents(studentCtx, api.ListMyActivityEventsRequestObject{})
	require.NoError(t, err)
	require.Len(t, events.(api.ListMyActivityEvents200JSONResponse).Data, 3)

	_, err = h.AddActivityParticipant(httpx.WithTenantID(ctx, tenant), api.AddActivityParticipantRequestObject{
		ActivityId: byClass, Body: &api.AddActivityParticipantJSONRequestBody{ClassId: &class},
	})
	requireStatus(t, err, http.StatusConflict)
}
