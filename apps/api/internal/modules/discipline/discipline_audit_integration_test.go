package discipline

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/crypto"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// disciplineFixture is one tenant with an active academic year, one
// class, one enrolled student and one counselor, built straight through
// the generated db.Queries the way cmd/seed does.
type disciplineFixture struct {
	tenantID    uuid.UUID
	yearID      uuid.UUID
	studentID   uuid.UUID
	counselorID uuid.UUID
}

// seedDisciplineFixture seeds raw fixture rows through adminPool
// (bypasses RLS the way a migration or a one-off admin script would); the
// module under test is constructed separately against AppPool so its
// service calls run under the same row level security production does.
func seedDisciplineFixture(t *testing.T, adminPool *pgxpool.Pool) disciplineFixture {
	t.Helper()
	ctx := context.Background()
	q := db.New(adminPool)

	tenantRow, err := q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: "discipline-test-" + uuid.NewString(), Name: "Discipline Test", EducationLevel: "sma",
		Timezone: "Asia/Jakarta", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)

	year, err := q.CreateAcademicYear(ctx, db.CreateAcademicYearParams{
		TenantID: tenantRow.ID, Label: "2026/2027",
		StartsOn: database.Date(time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)),
		EndsOn:   database.Date(time.Date(2027, 6, 30, 0, 0, 0, 0, time.UTC)),
		IsActive: true,
	})
	require.NoError(t, err)

	grade, err := q.CreateGradeLevel(ctx, db.CreateGradeLevelParams{
		TenantID: tenantRow.ID, Code: "X", Name: "Kelas X", Sequence: 1,
	})
	require.NoError(t, err)

	class, err := q.CreateClass(ctx, db.CreateClassParams{
		TenantID: tenantRow.ID, AcademicYearID: year.ID, GradeLevelID: grade.ID, Name: "X-A",
		Capacity: pgtype.Int4{Int32: 32, Valid: true},
	})
	require.NoError(t, err)

	student, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: tenantRow.ID, Username: "siswa-" + uuid.NewString(), PasswordHash: "x",
		Name: "Siswa Test", Status: "active", Locale: "id",
	})
	require.NoError(t, err)

	_, err = q.AcademicCreateEnrollment(ctx, db.AcademicCreateEnrollmentParams{
		TenantID: tenantRow.ID, AcademicYearID: year.ID, StudentUserID: student.ID, ClassID: class.ID,
		JoinedOn: database.Date(time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)),
	})
	require.NoError(t, err)

	counselor, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: tenantRow.ID, Username: "guru-bk-" + uuid.NewString(), PasswordHash: "x",
		Name: "Guru BK Test", Status: "active", Locale: "id",
	})
	require.NoError(t, err)

	return disciplineFixture{tenantID: tenantRow.ID, yearID: year.ID, studentID: student.ID, counselorID: counselor.ID}
}

// newTestDisciplineModule wires the discipline module against appPool --
// the least-privilege app_rw role, so row level security applies exactly
// like production -- never the admin pool used for fixture seeding.
func newTestDisciplineModule(t *testing.T, appPool *pgxpool.Pool) *Module {
	t.Helper()
	sealer, err := crypto.NewSealer("v1", "a-test-secret-of-at-least-32-bytes!")
	require.NoError(t, err)
	schoolModule := school.Register(appPool, tenant.ModeSingle, nil)
	return Register(Dependencies{
		Pool: appPool, Years: schoolModule.Service, Sealer: sealer, Clock: clock.Real{},
		Config: service.DefaultConfig("test-bucket"),
	})
}

// auditLogsFor loads every audit_logs row for one tenant/entity, newest
// first, to assert a service call wrote the record it claims to.
func auditLogsFor(t *testing.T, pool *pgxpool.Pool, tenantID, entityID uuid.UUID) []db.AuditLog {
	t.Helper()
	rows, err := db.New(pool).ListAuditLogs(context.Background(), db.ListAuditLogsParams{
		TenantID:  pgtype.UUID{Bytes: tenantID, Valid: true},
		EntityID:  pgtype.UUID{Bytes: entityID, Valid: true},
		PageLimit: 50,
	})
	require.NoError(t, err)
	return rows
}

// TestCounselingLifecycleWritesAuditRecords covers discipline's counseling
// notes: create, update and a single read of a sensitive note must each
// write an audit_logs row inside the same transaction as the change, and
// none of them may leak the note's encrypted content, follow-up plan,
// career goals or problem description into the audit payload.
func TestCounselingLifecycleWritesAuditRecords(t *testing.T) {
	pg := dbtest.Start(t)
	fx := seedDisciplineFixture(t, pg.AdminPool)
	mod := newTestDisciplineModule(t, pg.AppPool)
	ctx := context.Background()

	created, err := mod.Service.CreateCounseling(ctx, fx.tenantID, fx.counselorID, service.CounselingInput{
		StudentUserID: fx.studentID, SessionAt: time.Now(), Kind: domain.CounselingIndividual, Topic: domain.TopicPersonal,
		Title: "Sesi konseling", Content: "isi rahasia yang tidak boleh bocor ke audit log",
		Visibility: domain.VisibilityCounselor,
	})
	require.NoError(t, err)

	logs := auditLogsFor(t, pg.AdminPool, fx.tenantID, created.ID)
	require.Len(t, logs, 1, "CreateCounseling must write exactly one audit_logs row")
	require.Equal(t, "counseling.create", logs[0].Action)
	require.Equal(t, "counseling", logs[0].EntityType)
	require.NotContains(t, string(logs[0].After), "isi rahasia", "the note's content must never appear in the audit payload")

	_, err = mod.Service.UpdateCounseling(ctx, fx.tenantID, created.ID, fx.counselorID, service.CounselingInput{
		StudentUserID: fx.studentID, SessionAt: time.Now(), Kind: domain.CounselingIndividual, Topic: domain.TopicPersonal,
		Title: "Sesi konseling (revisi)", Content: "isi revisi yang juga rahasia",
		Visibility: domain.VisibilityBKTeam,
	})
	require.NoError(t, err)

	logs = auditLogsFor(t, pg.AdminPool, fx.tenantID, created.ID)
	require.Len(t, logs, 2, "UpdateCounseling must add one more audit_logs row")
	require.Equal(t, "counseling.update", logs[0].Action, "ListAuditLogs orders newest first")
	require.NotContains(t, string(logs[0].Before), "rahasia")
	require.NotContains(t, string(logs[0].After), "rahasia")

	_, err = mod.Service.GetCounseling(ctx, fx.tenantID, created.ID, fx.counselorID)
	require.NoError(t, err)

	logs = auditLogsFor(t, pg.AdminPool, fx.tenantID, created.ID)
	require.Len(t, logs, 3, "reading a sensitive note must also be recorded")
	require.Equal(t, "counseling.read", logs[0].Action)
}

// TestVoidViolationWritesAuditRecord covers discipline's violation void:
// VoidViolation must write an audit_logs row, inside the same transaction
// that flips the record's voided_at, recording who voided it and why.
func TestVoidViolationWritesAuditRecord(t *testing.T) {
	pg := dbtest.Start(t)
	fx := seedDisciplineFixture(t, pg.AdminPool)
	mod := newTestDisciplineModule(t, pg.AppPool)
	ctx := context.Background()

	vt, err := mod.Service.CreateViolationType(ctx, domain.ViolationType{
		TenantID: fx.tenantID, Code: "TL", Name: "Terlambat", Points: 5,
	})
	require.NoError(t, err)

	result, err := mod.Service.RecordViolation(ctx, fx.tenantID, service.RecordInput{
		StudentUserID: fx.studentID, ViolationTypeID: vt.ID, OccurredOn: time.Now(), ReporterUserID: fx.counselorID,
	})
	require.NoError(t, err)

	_, err = mod.Service.VoidViolation(ctx, fx.tenantID, result.Record.ID, fx.counselorID, "salah input")
	require.NoError(t, err)

	logs := auditLogsFor(t, pg.AdminPool, fx.tenantID, result.Record.ID)
	require.Len(t, logs, 1, "VoidViolation must write exactly one audit_logs row")
	require.Equal(t, "violation.void", logs[0].Action)
	require.Equal(t, "violation_record", logs[0].EntityType)
}
