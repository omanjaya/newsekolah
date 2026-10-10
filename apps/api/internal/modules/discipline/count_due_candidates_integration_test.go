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

// TestCountDueSPCandidatesMatchesCandidateList proves the action-inbox badge
// counts exactly the candidates the issuing screen would show with a level
// still due, so the number never drifts from the list it points at.
func TestCountDueSPCandidatesMatchesCandidateList(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	fx := seedDisciplineFixture(t, pg.AdminPool)
	mod := newTestDisciplineModule(t, pg.AppPool)
	q := db.New(pg.AdminPool)

	var classID uuid.UUID
	require.NoError(t, pg.AdminPool.QueryRow(ctx, `select id from classes where tenant_id = $1`, fx.tenantID).Scan(&classID))
	newStudent := func(name string) uuid.UUID {
		u, err := q.CreateUser(ctx, db.CreateUserParams{
			TenantID: fx.tenantID, Username: name + "-" + uuid.NewString(), PasswordHash: "x",
			Name: name, Status: "active", Locale: "id",
		})
		require.NoError(t, err)
		_, err = q.AcademicCreateEnrollment(ctx, db.AcademicCreateEnrollmentParams{
			TenantID: fx.tenantID, AcademicYearID: fx.yearID, StudentUserID: u.ID, ClassID: classID,
			JoinedOn: database.Date(time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)),
		})
		require.NoError(t, err)
		return u.ID
	}
	big, err := mod.Service.CreateViolationType(ctx, domain.ViolationType{TenantID: fx.tenantID, Code: "BIG", Name: "Besar", Points: 30})
	require.NoError(t, err)
	small, err := mod.Service.CreateViolationType(ctx, domain.ViolationType{TenantID: fx.tenantID, Code: "SML", Name: "Kecil", Points: 20})
	require.NoError(t, err)
	record := func(student, typeID uuid.UUID) {
		_, err := mod.Service.RecordViolation(ctx, fx.tenantID, service.RecordInput{
			StudentUserID: student, ViolationTypeID: typeID, OccurredOn: time.Date(2026, 8, 10, 0, 0, 0, 0, time.UTC), ReporterUserID: fx.counselorID,
		})
		require.NoError(t, err)
	}

	// Seeded directly: the service numbers letters through the document
	// pipeline, which collides across students when none is wired in.
	issueLetter := func(student uuid.UUID, level int) {
		_, err := pg.AdminPool.Exec(ctx, `insert into warning_letters
			(tenant_id, academic_year_id, student_user_id, level, level_label, threshold_points, total_points, letter_number)
			values ($1, $2, $3, $4, 'SP', 0, 0, $5)`, fx.tenantID, fx.yearID, student, level, uuid.NewString())
		require.NoError(t, err)
	}

	// Nobody has a candidate row yet.
	n, err := mod.Service.CountDueSPCandidates(ctx, fx.tenantID)
	require.NoError(t, err)
	require.Equal(t, 0, n)

	// 30 points, nothing issued: SP 1 due.
	dueFirst := newStudent("due-first")
	record(dueFirst, big.ID)
	// 30 points, SP 1 issued, SP 2 not reached: a candidate row, nothing due.
	issuedOnly := newStudent("issued-only")
	record(issuedOnly, big.ID)
	issueLetter(issuedOnly, 1)
	// 60 points, SP 1 issued: SP 2 due.
	dueSecond := newStudent("due-second")
	record(dueSecond, big.ID)
	record(dueSecond, big.ID)
	issueLetter(dueSecond, 1)
	// 20 points: below the first level, not a candidate.
	record(newStudent("below"), small.ID)

	policy, err := mod.Service.Policy(ctx, fx.tenantID)
	require.NoError(t, err)
	candidates, err := mod.Service.ListSPCandidates(ctx, fx.tenantID, uuid.NullUUID{}, 0, "", 200, 0)
	require.NoError(t, err)
	want := 0
	for _, c := range candidates {
		issued := make([]domain.WarningLetter, len(c.IssuedLevels))
		for i, level := range c.IssuedLevels {
			issued[i] = domain.WarningLetter{Level: level}
		}
		if len(policy.DueLevels(c.TotalPoints, issued)) > 0 {
			want++
		}
	}
	require.Equal(t, 2, want, "fixture sanity: two students have a level due")

	got, err := mod.Service.CountDueSPCandidates(ctx, fx.tenantID)
	require.NoError(t, err)
	require.Equal(t, want, got)
}
