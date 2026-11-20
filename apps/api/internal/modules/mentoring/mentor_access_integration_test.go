package mentoring

import (
	"context"
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/mentoring/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/mentoring/service"
	transporthttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/mentoring/transport/http"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

// schoolWide is a reader with view_mentoring (the principal, the admin).
var schoolWide = domain.Viewer{ReadAll: true}

// staticPerms answers every caller with the same permission set, standing
// in for the identity service in handler tests.
type staticPerms struct{ set authz.Set }

func (p staticPerms) EffectivePermissions(context.Context, uuid.UUID, uuid.UUID) (authz.Set, error) {
	return p.set, nil
}

// TestGuruWaliReachesOwnGroupOnly: the teacher role carried no mentoring
// permission, so the assigned mentor got 403 on their own group, the
// student snapshot, notes and term summaries. The teacher now holds
// manage_mentoring, scoped by the service to the groups they mentor: the
// mentor reaches everything of their group and another teacher nothing.
func TestGuruWaliReachesOwnGroupOnly(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	fx := seedMentoringFixture(t, pg.AdminPool)
	mod := newTestMentoringModule(t, pg.AppPool)
	q := db.New(pg.AdminPool)

	other, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: fx.tenantID, Username: "guru-lain-" + uuid.NewString(), PasswordHash: "x",
		Name: "Guru Lain", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	require.NoError(t, q.CreateUserProfile(ctx, db.CreateUserProfileParams{UserID: other.ID, TenantID: fx.tenantID, Kind: "teacher"}))
	term, err := q.AcademicCreateTerm(ctx, db.AcademicCreateTermParams{
		TenantID: fx.tenantID, AcademicYearID: fx.yearID, Name: "Semester 1", Sequence: 1,
		StartsOn: database.Date(time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)),
		EndsOn:   database.Date(time.Date(2026, 12, 31, 0, 0, 0, 0, time.UTC)),
	})
	require.NoError(t, err)

	group, err := mod.Service.CreateGroup(ctx, fx.tenantID, service.GroupInput{MentorUserID: fx.mentorID, Name: "Wali X-A"})
	require.NoError(t, err)
	_, err = mod.Service.AssignStudent(ctx, fx.tenantID, group.ID, fx.studentID)
	require.NoError(t, err)

	mentor := domain.Viewer{UserID: fx.mentorID}
	stranger := domain.Viewer{UserID: other.ID}

	// The mentor: group, members, snapshot, notes and the term summary.
	_, err = mod.Service.GetGroup(ctx, fx.tenantID, mentor, group.ID)
	require.NoError(t, err)
	members, err := mod.Service.ListMembers(ctx, fx.tenantID, mentor, group.ID)
	require.NoError(t, err)
	require.Len(t, members, 1)
	snapshot, err := mod.Service.StudentSnapshot(ctx, fx.tenantID, mentor, fx.studentID)
	require.NoError(t, err)
	require.Equal(t, "Siswa Test", snapshot.StudentName)
	_, err = mod.Service.CreateMeetingNote(ctx, fx.tenantID, mentor, service.MeetingNoteInput{
		GroupID: group.ID, MetAt: time.Now(), Kind: domain.MeetingIndividual, AttendeeUserIDs: []uuid.UUID{fx.studentID},
		Topic: "Topik", Content: "Isi",
	})
	require.NoError(t, err)
	notes, err := mod.Service.ListMeetingNotesForGroup(ctx, fx.tenantID, mentor, group.ID)
	require.NoError(t, err)
	require.Len(t, notes, 1)

	// The term summary saves (it used to insert a zero tenant id and
	// fail with a 500) and reads back.
	text := "Siswa aktif di kelas, perlu meningkatkan kedisiplinan tugas."
	written, err := mod.Service.WriteTermSummary(ctx, fx.tenantID, mentor, service.TermSummaryInput{
		TermID: term.ID, GroupID: group.ID, StudentUserID: fx.studentID, Summary: text,
	})
	require.NoError(t, err)
	require.Equal(t, fx.tenantID, written.TenantID)
	read, err := mod.Service.GetTermSummary(ctx, fx.tenantID, mentor, group.ID, term.ID, fx.studentID)
	require.NoError(t, err)
	require.Equal(t, text, read.Summary)
	// Writing again replaces the same summary.
	_, err = mod.Service.WriteTermSummary(ctx, fx.tenantID, mentor, service.TermSummaryInput{
		TermID: term.ID, GroupID: group.ID, StudentUserID: fx.studentID, Summary: "Revisi",
	})
	require.NoError(t, err)
	read, err = mod.Service.GetTermSummary(ctx, fx.tenantID, mentor, group.ID, term.ID, fx.studentID)
	require.NoError(t, err)
	require.Equal(t, "Revisi", read.Summary)

	// Another teacher: nothing of a group they do not mentor.
	_, err = mod.Service.GetGroup(ctx, fx.tenantID, stranger, group.ID)
	require.ErrorIs(t, err, domain.ErrGroupForbidden)
	_, err = mod.Service.ListMembers(ctx, fx.tenantID, stranger, group.ID)
	require.ErrorIs(t, err, domain.ErrGroupForbidden)
	_, err = mod.Service.StudentSnapshot(ctx, fx.tenantID, stranger, fx.studentID)
	require.ErrorIs(t, err, domain.ErrGroupForbidden)
	_, err = mod.Service.ListMeetingNotesForGroup(ctx, fx.tenantID, stranger, group.ID)
	require.ErrorIs(t, err, domain.ErrGroupForbidden)
	_, err = mod.Service.CreateMeetingNote(ctx, fx.tenantID, stranger, service.MeetingNoteInput{
		GroupID: group.ID, MetAt: time.Now(), Kind: domain.MeetingIndividual, AttendeeUserIDs: []uuid.UUID{fx.studentID},
		Topic: "Topik", Content: "Isi",
	})
	require.ErrorIs(t, err, domain.ErrGroupForbidden)
	_, err = mod.Service.WriteTermSummary(ctx, fx.tenantID, stranger, service.TermSummaryInput{
		TermID: term.ID, GroupID: group.ID, StudentUserID: fx.studentID, Summary: "x",
	})
	require.ErrorIs(t, err, domain.ErrGroupForbidden)
	_, err = mod.Service.GetTermSummary(ctx, fx.tenantID, stranger, group.ID, term.ID, fx.studentID)
	require.ErrorIs(t, err, domain.ErrGroupForbidden)

	// A school-wide reader opens any group and snapshot.
	_, err = mod.Service.GetGroup(ctx, fx.tenantID, schoolWide, group.ID)
	require.NoError(t, err)

	// Through the handler, with the teacher role's permissions.
	teacherPerms := staticPerms{set: authz.NewSet(authz.PermManageMentoring)}
	mod.Handler = transporthttp.New(mod.Service, teacherPerms)
	mentorCtx := httpx.WithUserID(httpx.WithTenantID(ctx, fx.tenantID), fx.mentorID)
	strangerCtx := httpx.WithUserID(httpx.WithTenantID(ctx, fx.tenantID), other.ID)

	mine, err := mod.Handler.ListMyMentorGroups(mentorCtx, api.ListMyMentorGroupsRequestObject{})
	require.NoError(t, err)
	require.Len(t, mine.(api.ListMyMentorGroups200JSONResponse).Data, 1)
	_, err = mod.Handler.GetMentorGroup(mentorCtx, api.GetMentorGroupRequestObject{GroupId: group.ID})
	require.NoError(t, err)
	_, err = mod.Handler.GetMentorStudentSnapshot(mentorCtx, api.GetMentorStudentSnapshotRequestObject{StudentId: fx.studentID})
	require.NoError(t, err)

	requireStatus := func(err error, status int) {
		t.Helper()
		var appErr *httpx.Error
		require.True(t, errors.As(err, &appErr), "want an *httpx.Error, got %v", err)
		require.Equal(t, status, appErr.Status)
	}
	_, err = mod.Handler.GetMentorGroup(strangerCtx, api.GetMentorGroupRequestObject{GroupId: group.ID})
	requireStatus(err, http.StatusForbidden)
	_, err = mod.Handler.ListMentorMeetingNotes(strangerCtx, api.ListMentorMeetingNotesRequestObject{GroupId: group.ID})
	requireStatus(err, http.StatusForbidden)
	_, err = mod.Handler.GetMentorStudentSnapshot(strangerCtx, api.GetMentorStudentSnapshotRequestObject{StudentId: fx.studentID})
	requireStatus(err, http.StatusForbidden)
	_, err = mod.Handler.WriteMentorTermSummary(strangerCtx, api.WriteMentorTermSummaryRequestObject{
		GroupId: group.ID, TermId: term.ID, StudentId: fx.studentID,
		Body: &api.WriteMentorTermSummaryJSONRequestBody{Summary: "x"},
	})
	requireStatus(err, http.StatusForbidden)
}

// TestTeacherRoleCarriesMentorPermission pins the role defaults the guru
// wali and pembina workflows depend on: manage_mentoring and
// record_extracurricular_attendance, never the school-wide view_mentoring
// or view_activities.
func TestTeacherRoleCarriesMentorPermission(t *testing.T) {
	for _, role := range authz.RoleDefaults() {
		if role.Slug != authz.RoleSlugTeacher {
			continue
		}
		set := authz.NewSet(role.Permissions...)
		require.True(t, set.Has(authz.PermManageMentoring))
		require.False(t, set.Has(authz.PermViewMentoring))
		require.False(t, set.Has(authz.PermManageMentorGroups))
		require.True(t, set.Has(authz.PermRecordExtracurricularAttendance))
		require.False(t, set.Has(authz.PermViewActivities))
		return
	}
	t.Fatal("teacher role default missing")
}
