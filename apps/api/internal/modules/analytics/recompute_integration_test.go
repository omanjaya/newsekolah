package analytics

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// firstTermGrading reports one student with published report scores in a
// first term: no previous term, so no trend, but subjects below KKTP.
type firstTermGrading struct{ below map[uuid.UUID]int }

func (g firstTermGrading) ReportTrends(_ context.Context, _ uuid.UUID, ids []uuid.UUID) (map[uuid.UUID]service.GradeTrend, error) {
	out := make(map[uuid.UUID]service.GradeTrend, len(ids))
	for _, id := range ids {
		out[id] = service.GradeTrend{ScoredSubjects: 8, SubjectsBelowKKTP: g.below[id]}
	}
	return out, nil
}

// TestEarlyWarningReactsTheSameDay covers the two ways the list used to
// stay stale until a once-a-day run: saving the policy now rescores the
// school at once, and an overseer can rescore on demand. It also covers
// grades: subjects below KKTP count in a first term with no previous term.
func TestEarlyWarningReactsTheSameDay(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	q := db.New(pg.AdminPool)

	tn, err := q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: "ew-same-day", Name: "EW Same Day", EducationLevel: "sma", Timezone: "Asia/Makassar",
		Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)
	year, err := q.CreateAcademicYear(ctx, db.CreateAcademicYearParams{
		TenantID: tn.ID, Label: "2026/2027",
		StartsOn: database.Date(time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)),
		EndsOn:   database.Date(time.Date(2030, 6, 30, 0, 0, 0, 0, time.UTC)),
		IsActive: true,
	})
	require.NoError(t, err)
	var gradeLevelID uuid.UUID
	require.NoError(t, pg.AdminPool.QueryRow(ctx,
		`insert into grade_levels (tenant_id, code, name, sequence) values ($1, 'X', 'Kelas X', 1) returning id`, tn.ID,
	).Scan(&gradeLevelID))
	class, err := q.CreateClass(ctx, db.CreateClassParams{TenantID: tn.ID, AcademicYearID: year.ID, GradeLevelID: gradeLevelID, Name: "X-A"})
	require.NoError(t, err)

	failing, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: tn.ID, Username: "siswa-gagal-" + uuid.NewString(), PasswordHash: "x", Name: "Siswa Dua Contoh", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	passing, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: tn.ID, Username: "siswa-lulus-" + uuid.NewString(), PasswordHash: "x", Name: "Siswa Contoh", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	for _, id := range []uuid.UUID{failing.ID, passing.ID} {
		_, err := q.AcademicCreateEnrollment(ctx, db.AcademicCreateEnrollmentParams{
			TenantID: tn.ID, AcademicYearID: year.ID, StudentUserID: id, ClassID: class.ID,
			JoinedOn: database.Date(time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)),
		})
		require.NoError(t, err)
	}

	schoolModule := school.Register(pg.AppPool, tenant.ModeSingle, nil)
	svc := Register(Dependencies{
		Pool: pg.AppPool, Years: schoolModule.Service, Clock: clock.Real{},
		Grading: firstTermGrading{below: map[uuid.UUID]int{failing.ID: 3}},
	}).Service
	adminID := uuid.New()

	scored, computedAt, err := svc.RecomputeNow(ctx, tn.ID)
	require.NoError(t, err)
	require.Equal(t, 2, scored)
	require.False(t, computedAt.IsZero())

	detail, err := svc.GetStudentRisk(ctx, tn.ID, adminID, failing.ID, true)
	require.NoError(t, err)
	require.Equal(t, 3, detail.Signals.SubjectsBelowKKTP)
	require.False(t, detail.Signals.HasGradeTrend, "a first term has no trend")
	require.Len(t, detail.Reasons, 1)
	require.Equal(t, domain.ReasonBelowKKTPAtRisk, detail.Reasons[0].Code)
	require.Equal(t, domain.LevelNone, detail.Level, "the default weights need more than grades alone")
	firstComputed := detail.ComputedAt

	// A school that lets grades alone put a student on watch: saving that
	// policy shows on the list at once, with no separate recompute.
	policy, err := svc.Policy(ctx, tn.ID)
	require.NoError(t, err)
	policy.WatchScore, policy.AtRiskScore = 10, 35
	_, err = svc.UpdatePolicy(ctx, tn.ID, adminID, policy)
	require.NoError(t, err)

	detail, err = svc.GetStudentRisk(ctx, tn.ID, adminID, failing.ID, true)
	require.NoError(t, err)
	require.Equal(t, domain.LevelWatch, detail.Level)
	require.Equal(t, policy.Version+1, detail.PolicyVersion)
	require.False(t, detail.ComputedAt.Before(firstComputed))

	clean, err := svc.GetStudentRisk(ctx, tn.ID, adminID, passing.ID, true)
	require.NoError(t, err)
	require.Equal(t, domain.LevelNone, clean.Level)
	require.Empty(t, clean.Reasons)
}
