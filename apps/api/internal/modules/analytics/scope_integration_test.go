package analytics

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// TestAtRiskStudentsScopeByRole is the regression test for the bug fixed
// here: GET /v1/analytics/at-risk-students (and the per-student detail
// endpoint) returned 403/ErrNotHomeroomTeacher for admin/super_admin/
// principal callers who hold view_early_warning through their role but
// have no counselor/leadership duty and are not a homeroom teacher --
// service/list.go's resolveScope only granted school-wide scope to the
// counselor/leadership duties before falling back to "must be a homeroom
// teacher". It now also grants school-wide scope to isOverseer callers
// (the transport layer's isAdminCaller, transport/http/dashboard.go),
// mirroring TestViewGradesScoping in the grading module (view_grades_
// integration_test.go), which covers the equivalent bypass there.
func TestAtRiskStudentsScopeByRole(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	q := db.New(pg.AdminPool)

	tn, err := q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: "atrisk-scope", Name: "Atrisk Scope", EducationLevel: "sma", Timezone: "Asia/Jakarta",
		Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)
	tenantID := tn.ID

	year, err := q.CreateAcademicYear(ctx, db.CreateAcademicYearParams{
		TenantID: tenantID, Label: "2025/2026",
		StartsOn: database.Date(time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)),
		EndsOn:   database.Date(time.Date(2030, 1, 1, 0, 0, 0, 0, time.UTC)),
		IsActive: true,
	})
	require.NoError(t, err)
	yearID := year.ID

	var gradeLevelID uuid.UUID
	require.NoError(t, pg.AdminPool.QueryRow(ctx,
		`insert into grade_levels (tenant_id, code, name, sequence) values ($1, 'X', 'Kelas X', 1) returning id`,
		tenantID,
	).Scan(&gradeLevelID))

	classA, err := q.CreateClass(ctx, db.CreateClassParams{TenantID: tenantID, AcademicYearID: yearID, GradeLevelID: gradeLevelID, Name: "X-A"})
	require.NoError(t, err)
	classB, err := q.CreateClass(ctx, db.CreateClassParams{TenantID: tenantID, AcademicYearID: yearID, GradeLevelID: gradeLevelID, Name: "X-B"})
	require.NoError(t, err)

	studentA, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: tenantID, Username: "siswa-a-" + uuid.NewString(), PasswordHash: "x", Name: "Siswa A", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	studentB, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: tenantID, Username: "siswa-b-" + uuid.NewString(), PasswordHash: "x", Name: "Siswa B", Status: "active", Locale: "id",
	})
	require.NoError(t, err)

	// The four callers this test distinguishes: a plain teacher with no
	// duty and no homeroom class, a homeroom teacher of classA only, and
	// two callers standing in for admin/principal -- resolveScope only
	// ever sees the isOverseer bool the transport layer computes from
	// their roles (isAdminCaller), never the roles themselves, so a plain
	// user id is enough to represent them here.
	plainTeacher, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: tenantID, Username: "guru-polos-" + uuid.NewString(), PasswordHash: "x", Name: "Guru Polos", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	homeroomTeacher, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: tenantID, Username: "wali-kelas-" + uuid.NewString(), PasswordHash: "x", Name: "Wali Kelas", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	adminLike, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: tenantID, Username: "admin-" + uuid.NewString(), PasswordHash: "x", Name: "Admin Test", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	principalLike, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: tenantID, Username: "kepsek-" + uuid.NewString(), PasswordHash: "x", Name: "Kepala Sekolah Test", Status: "active", Locale: "id",
	})
	require.NoError(t, err)

	homeroomDutyType, err := q.CreateDutyType(ctx, db.CreateDutyTypeParams{TenantID: tenantID, Slug: "homeroom", Name: "Wali Kelas", ScopeKind: "class"})
	require.NoError(t, err)
	_, err = q.CreateDutyAssignment(ctx, db.CreateDutyAssignmentParams{
		TenantID: tenantID, AcademicYearID: yearID, DutyTypeID: homeroomDutyType.ID, UserID: homeroomTeacher.ID,
		ScopeClassID: database.NullUUID(uuid.NullUUID{UUID: classA.ID, Valid: true}),
		StartsOn:     database.Date(time.Now().AddDate(0, 0, -30)),
	})
	require.NoError(t, err)

	// Seed a stored risk result per class directly (UpsertResult), since
	// this test is about read scoping, not the recompute job that
	// produces these rows in production.
	schoolModule := school.Register(pg.AppPool, tenant.ModeSingle, nil)
	svc := Register(Dependencies{Pool: pg.AppPool, Years: schoolModule.Service, Clock: clock.Real{}}).Service

	seedResult := func(studentID, classID uuid.UUID) {
		require.NoError(t, database.WithTenantTx(ctx, pg.AppPool, tenantID, func(ctx context.Context) error {
			return repoUpsert(ctx, pg.AppPool, tenantID, yearID, studentID, classID)
		}))
	}
	seedResult(studentA.ID, classA.ID)
	seedResult(studentB.ID, classB.ID)

	t.Run("admin (isOverseer) sees every class", func(t *testing.T) {
		results, err := svc.ListAtRiskStudents(ctx, tenantID, adminLike.ID, true)
		require.NoError(t, err)
		require.Len(t, results, 2)

		_, err = svc.GetStudentRisk(ctx, tenantID, adminLike.ID, studentB.ID, true)
		require.NoError(t, err)
	})

	t.Run("principal (isOverseer) sees every class", func(t *testing.T) {
		results, err := svc.ListAtRiskStudents(ctx, tenantID, principalLike.ID, true)
		require.NoError(t, err)
		require.Len(t, results, 2)

		_, err = svc.GetStudentRisk(ctx, tenantID, principalLike.ID, studentA.ID, true)
		require.NoError(t, err)
	})

	t.Run("a plain teacher without duty or homeroom is still refused", func(t *testing.T) {
		_, err := svc.ListAtRiskStudents(ctx, tenantID, plainTeacher.ID, false)
		require.ErrorIs(t, err, service.ErrNotHomeroomTeacher)

		_, err = svc.GetStudentRisk(ctx, tenantID, plainTeacher.ID, studentA.ID, false)
		require.ErrorIs(t, err, service.ErrNotHomeroomTeacher)
	})

	t.Run("the homeroom teacher sees only their own class", func(t *testing.T) {
		results, err := svc.ListAtRiskStudents(ctx, tenantID, homeroomTeacher.ID, false)
		require.NoError(t, err)
		require.Len(t, results, 1)
		require.Equal(t, studentA.ID, results[0].StudentUserID)

		_, err = svc.GetStudentRisk(ctx, tenantID, homeroomTeacher.ID, studentA.ID, false)
		require.NoError(t, err)

		_, err = svc.GetStudentRisk(ctx, tenantID, homeroomTeacher.ID, studentB.ID, false)
		require.ErrorIs(t, err, service.ErrResultNotFound)
	})
}

// repoUpsert writes one analytics_student_risk row through the module's
// own repository, the same write path the recompute job uses, so this
// test does not hand-roll SQL against a table it should treat as an
// implementation detail.
func repoUpsert(ctx context.Context, pool *pgxpool.Pool, tenantID, yearID, studentID, classID uuid.UUID) error {
	repo := repository.New(pool)
	return repo.UpsertResult(ctx, tenantID, service.StoredResult{
		AcademicYearID: yearID,
		StudentUserID:  studentID,
		ClassID:        uuid.NullUUID{UUID: classID, Valid: true},
		Level:          domain.LevelWatch,
		Score:          10,
		Signals:        domain.Signals{},
		Reasons:        []domain.Reason{},
		PolicyVersion:  1,
		ComputedAt:     time.Now(),
	})
}
