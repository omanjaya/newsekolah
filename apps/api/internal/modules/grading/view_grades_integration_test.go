package grading

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// TestViewGradesScoping exercises the scope-width boolean grading/
// transport/http/handler.go's canViewAny computes (view_reports or
// manage_master_data) at the service layer, the same way every other
// grading test in this package exercises canManageAny -- there is no HTTP
// test harness in this codebase, so authz.Authorize's permission-gate
// decision is covered separately (platform/authz/
// grading_view_permission_integration_test.go, which proves a principal
// gets 403 on SaveComponentScores/SetGradePublication and is admitted to
// GetGradebook/ExportGradebook against the real bundled spec); this test
// covers the scope-width half: that the bypass a principal or admin gets
// through view_grades/manage_master_data (represented here as
// canViewAny/canManageAny=true, since the service only ever sees the
// bool, not which permission produced it) reads across the whole school
// without widening a plain teacher's own scope.
func TestViewGradesScoping(t *testing.T) {
	pg := dbtest.Start(t)
	fx := seedFixture(t, pg.AdminPool)
	ctx := context.Background()

	q := db.New(pg.AdminPool)
	// fx.teacherID (seedFixture) has no teaching_assignments row of its
	// own -- every existing test in this package always bypasses
	// requireTeaches (canManageAny=true). This test needs a teacher who
	// really is assigned to fx.classID/fx.subjectID, and a second one who
	// is not, so give fx.teacherID the assignment explicitly.
	_, err := q.AcademicCreateTeachingAssignment(ctx, db.AcademicCreateTeachingAssignmentParams{
		TenantID: fx.tenantID, AcademicYearID: fx.yearID, TeacherUserID: fx.teacherID,
		SubjectID: fx.subjectID, ClassID: fx.classID,
	})
	require.NoError(t, err)

	otherTeacher, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: fx.tenantID, Username: "guru-lain-" + uuid.NewString(), PasswordHash: "x",
		Name: "Guru Lain", Status: "active", Locale: "id",
	})
	require.NoError(t, err)

	// principalLike and adminLike are never assigned to teach anything --
	// exactly a principal's or an admin's real situation -- so any read
	// that succeeds for them must come from the bypass, not from
	// requireTeaches finding a real assignment.
	principalLike, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: fx.tenantID, Username: "kepsek-" + uuid.NewString(), PasswordHash: "x",
		Name: "Kepala Sekolah Test", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	adminLike, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: fx.tenantID, Username: "admin-" + uuid.NewString(), PasswordHash: "x",
		Name: "Admin Test", Status: "active", Locale: "id",
	})
	require.NoError(t, err)

	schoolModule := school.Register(pg.AppPool, tenant.ModeSingle, nil)
	svc := Register(Dependencies{Pool: pg.AppPool, Years: schoolModule.Service, Clock: clock.Real{}}).Service

	query := service.GradebookQuery{ClassID: fx.classID, SubjectID: fx.subjectID, TermID: uuid.NullUUID{UUID: fx.termID, Valid: true}}

	t.Run("principal (view_grades bypass) reads a class gradebook it does not teach", func(t *testing.T) {
		_, err := svc.Gradebook(ctx, fx.tenantID, principalLike.ID, true, query)
		require.NoError(t, err)
	})

	t.Run("principal (view_grades bypass) exports the same gradebook", func(t *testing.T) {
		classID := fx.classID
		_, err := svc.ExportGradebook(ctx, fx.tenantID, principalLike.ID, true, service.GradebookExportQuery{
			ClassID: &classID, SubjectID: fx.subjectID, TermID: uuid.NullUUID{UUID: fx.termID, Valid: true},
		}, reportdoc.LocaleID, reportdoc.Options{Format: reportdoc.FormatXLSX})
		require.NoError(t, err)
	})

	t.Run("admin (manage_master_data bypass) is unaffected: still reads across the school", func(t *testing.T) {
		_, err := svc.Gradebook(ctx, fx.tenantID, adminLike.ID, true, query)
		require.NoError(t, err)
	})

	t.Run("a plain teacher still cannot read another teacher's class", func(t *testing.T) {
		_, err := svc.Gradebook(ctx, fx.tenantID, otherTeacher.ID, false, query)
		require.ErrorIs(t, err, domain.ErrNotTeachingThisClass)
	})

	t.Run("the assigned teacher still reads their own class without a bypass", func(t *testing.T) {
		_, err := svc.Gradebook(ctx, fx.tenantID, fx.teacherID, false, query)
		require.NoError(t, err)
	})

	t.Run("principal never gets the write bypass: saving scores on an unowned class is still refused", func(t *testing.T) {
		// grading/transport/http/handler.go's canManageAny (manage_master_data
		// only) is unchanged by this feature, so a principal -- who holds
		// neither manage_grades nor manage_master_data -- would never reach
		// SaveComponentScores at all (proven at the authz/permission layer);
		// this is the defense-in-depth check that even a canManageAny=false
		// call on their behalf is still scoped to classes they teach.
		component, err := svc.CreateComponent(ctx, fx.tenantID, fx.teacherID, true, service.ComponentInput{
			ClassID: fx.classID, SubjectID: fx.subjectID, TermID: uuid.NullUUID{UUID: fx.termID, Valid: true},
			Code: "UH-VG", Kind: domain.KindFormative, Weight: 1,
		})
		require.NoError(t, err)
		score := 90.0
		_, err = svc.SaveScores(ctx, fx.tenantID, component.ID, principalLike.ID, false, []service.ScoreEntry{
			{StudentUserID: fx.studentID, Score: &score},
		})
		require.ErrorIs(t, err, domain.ErrNotTeachingThisClass)

		_, err = svc.Publish(ctx, fx.tenantID, principalLike.ID, false, fx.classID, fx.subjectID,
			uuid.NullUUID{UUID: fx.termID, Valid: true}, true)
		require.ErrorIs(t, err, domain.ErrNotTeachingThisClass)
	})
}
