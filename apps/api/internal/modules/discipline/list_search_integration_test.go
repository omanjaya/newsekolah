package discipline

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// TestListSearchFiltersByStudentNameAndNIS proves the four paged discipline
// lists (violations ledger, issued letters, own counseling notes, BK-team
// notes) narrow by the student's name or NIS before LIMIT/OFFSET, ignore a
// term shorter than two characters, and never match on note content.
func TestListSearchFiltersByStudentNameAndNIS(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	fx := seedDisciplineFixture(t, pg.AdminPool)
	mod := newTestDisciplineModule(t, pg.AppPool)
	q := db.New(pg.AdminPool)

	var classID uuid.UUID
	require.NoError(t, pg.AdminPool.QueryRow(ctx, `select id from classes where tenant_id = $1`, fx.tenantID).Scan(&classID))

	// fx.studentID is "Siswa Test"; add a second student with a distinct name.
	budi, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: fx.tenantID, Username: "budi-" + uuid.NewString(), PasswordHash: "x",
		Name: "Budi Santoso", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	_, err = q.AcademicCreateEnrollment(ctx, db.AcademicCreateEnrollmentParams{
		TenantID: fx.tenantID, AcademicYearID: fx.yearID, StudentUserID: budi.ID, ClassID: classID,
		JoinedOn: database.Date(time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)),
	})
	require.NoError(t, err)
	for id, nis := range map[uuid.UUID]string{fx.studentID: "1001", budi.ID: "2002"} {
		_, err = pg.AdminPool.Exec(ctx, `insert into student_profiles (user_id, tenant_id, nis) values ($1, $2, $3)`, id, fx.tenantID, nis)
		require.NoError(t, err)
	}

	dutyType, err := q.CreateDutyType(ctx, db.CreateDutyTypeParams{
		TenantID: fx.tenantID, Slug: "counselor", Name: "Guru BK", ScopeKind: "school",
	})
	require.NoError(t, err)
	_, err = q.CreateDutyAssignment(ctx, db.CreateDutyAssignmentParams{
		TenantID: fx.tenantID, AcademicYearID: fx.yearID, DutyTypeID: dutyType.ID, UserID: fx.counselorID,
		StartsOn: database.Date(time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)),
	})
	require.NoError(t, err)

	vt, err := mod.Service.CreateViolationType(ctx, domain.ViolationType{TenantID: fx.tenantID, Code: "BLR", Name: "Bolos", Points: 30})
	require.NoError(t, err)
	for _, student := range []uuid.UUID{fx.studentID, budi.ID} {
		_, err = mod.Service.RecordViolation(ctx, fx.tenantID, service.RecordInput{
			StudentUserID: student, ViolationTypeID: vt.ID, OccurredOn: time.Date(2026, 8, 10, 0, 0, 0, 0, time.UTC), ReporterUserID: fx.counselorID,
		})
		require.NoError(t, err)
		// Seeded directly: the service numbers letters through the document
		// pipeline, which collides across students when none is wired in.
		_, err = pg.AdminPool.Exec(ctx, `insert into warning_letters
			(tenant_id, academic_year_id, student_user_id, level, level_label, threshold_points, total_points, letter_number)
			values ($1, $2, $3, 1, 'SP 1', 30, 30, $4)`, fx.tenantID, fx.yearID, student, uuid.NewString())
		require.NoError(t, err)
		_, err = mod.Service.CreateCounseling(ctx, fx.tenantID, fx.counselorID, service.CounselingInput{
			StudentUserID: student, SessionAt: time.Now(), Kind: domain.CounselingIndividual, Topic: domain.TopicPersonal,
			Title: "Sesi", Content: "catatan rahasia zebra", Visibility: domain.VisibilityBKTeam,
		})
		require.NoError(t, err)
	}

	studentsOf := func(rows []domain.ViolationRecord) []uuid.UUID {
		out := make([]uuid.UUID, len(rows))
		for i, r := range rows {
			out[i] = r.StudentUserID
		}
		return out
	}

	cases := []struct {
		name   string
		search string
		want   []uuid.UUID
	}{
		{"name, case-insensitive and trimmed", "  budi ", []uuid.UUID{budi.ID}},
		{"name partial", "siswa", []uuid.UUID{fx.studentID}},
		{"nis", "2002", []uuid.UUID{budi.ID}},
		{"single character is ignored", "b", []uuid.UUID{budi.ID, fx.studentID}},
		{"no match", "tidak ada", nil},
		{"note content is never searched", "zebra", nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			records, err := mod.Service.ListRecords(ctx, fx.tenantID, service.RecordFilter{Search: tc.search, Limit: 50})
			require.NoError(t, err)
			require.ElementsMatch(t, tc.want, studentsOf(records), "violations ledger")

			letters, err := mod.Service.ListWarningLetters(ctx, fx.tenantID, uuid.NullUUID{}, tc.search, 50, 0)
			require.NoError(t, err)
			require.Len(t, letters, len(tc.want), "warning letters")

			mine, err := mod.Service.ListMyCounselings(ctx, fx.tenantID, fx.counselorID, tc.search, 50, 0)
			require.NoError(t, err)
			require.Len(t, mine, len(tc.want), "my counselings")

			team, err := mod.Service.ListBKTeamCounselings(ctx, fx.tenantID, fx.counselorID, "", tc.search, 50, 0)
			require.NoError(t, err)
			require.Len(t, team, len(tc.want), "bk team counselings")
		})
	}
}
