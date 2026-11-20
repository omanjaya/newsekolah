package grading

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// reportScoreRows reads the class-subject's report_scores rows straight
// from the table the gradebook, the e-Rapor preview and the e-Rapor export
// all read, keyed by student.
func reportScoreRows(t *testing.T, pool *pgxpool.Pool, fx fixture) map[uuid.UUID]float64 {
	t.Helper()
	rows, err := pool.Query(context.Background(),
		`select student_user_id, final_score::float8 from report_scores
		 where tenant_id = $1 and term_id = $2 and class_id = $3 and subject_id = $4`,
		fx.tenantID, fx.termID, fx.classID, fx.subjectID)
	require.NoError(t, err)
	defer rows.Close()
	out := map[uuid.UUID]float64{}
	for rows.Next() {
		var (
			id    uuid.UUID
			score float64
		)
		require.NoError(t, rows.Scan(&id, &score))
		out[id] = score
	}
	require.NoError(t, rows.Err())
	return out
}

// seedClassmate enrols a second student in fx's own class.
func seedClassmate(t *testing.T, pool *pgxpool.Pool, fx fixture) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	q := db.New(pool)
	student, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: fx.tenantID, Username: "siswa-teman-" + uuid.NewString(), PasswordHash: "x",
		Name: "Siswa Teman", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	_, err = q.AcademicCreateEnrollment(ctx, db.AcademicCreateEnrollmentParams{
		TenantID: fx.tenantID, AcademicYearID: fx.yearID, StudentUserID: student.ID, ClassID: fx.classID,
		JoinedOn: database.Date(time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)),
	})
	require.NoError(t, err)
	return student.ID
}

func gradebookStudent(t *testing.T, book service.Gradebook, studentID uuid.UUID) service.GradebookStudent {
	t.Helper()
	for _, s := range book.Students {
		if s.StudentUserID == studentID {
			return s
		}
	}
	t.Fatalf("student %s missing from the gradebook", studentID)
	return service.GradebookStudent{}
}

// TestClearingEveryScoreDropsTheReportScore reproduces grades-R1: a teacher
// clears a student's scores one column at a time (the way "Simpan semua"
// saves). Each save recomputes the report score; after the last one the
// student has nothing left to average, so the report score must go too,
// not stay at the value of the second-to-last save and be exported to
// e-Rapor.
func TestClearingEveryScoreDropsTheReportScore(t *testing.T) {
	pg := dbtest.Start(t)
	fx := seedFixture(t, pg.AdminPool)
	ctx := context.Background()

	schoolModule := school.Register(pg.AppPool, tenant.ModeSingle, nil)
	svc := Register(Dependencies{Pool: pg.AppPool, Years: schoolModule.Service, Clock: clock.Real{}}).Service
	term := uuid.NullUUID{UUID: fx.termID, Valid: true}

	newComponent := func(code string, kind domain.ComponentKind) domain.Component {
		c, err := svc.CreateComponent(ctx, fx.tenantID, fx.teacherID, true, service.ComponentInput{
			ClassID: fx.classID, SubjectID: fx.subjectID, TermID: term, Code: code, Kind: kind, Weight: 1,
		})
		require.NoError(t, err)
		return c
	}
	tg := newComponent("TG1", domain.KindFormative)
	pts := newComponent("PTS", domain.KindSummative)

	save := func(componentID uuid.UUID, score *float64) service.Gradebook {
		book, err := svc.SaveScores(ctx, fx.tenantID, componentID, fx.teacherID, true, []service.ScoreEntry{
			{StudentUserID: fx.studentID, Score: score},
		})
		require.NoError(t, err)
		return book
	}
	tgScore, ptsScore := 88.0, 91.25
	save(tg.ID, &tgScore)
	book := save(pts.ID, &ptsScore)
	require.NotNil(t, gradebookStudent(t, book, fx.studentID).ReportScore)

	book = save(tg.ID, nil)
	student := gradebookStudent(t, book, fx.studentID)
	require.NotNil(t, student.ReportScore, "one grade left still averages to a report score")
	require.InDelta(t, 91.25, *student.ReportScore, 0.001)

	book = save(pts.ID, nil)
	student = gradebookStudent(t, book, fx.studentID)
	require.Empty(t, student.Scores)
	require.Nil(t, student.Average)
	require.Nil(t, student.ReportScore, "a student with no grades left has no report score")
	require.NotContains(t, reportScoreRows(t, pg.AdminPool, fx), fx.studentID,
		"the e-Rapor export reads report_scores, so the stale row must be gone")
}

// TestDeletingTheLastComponentDropsReportScoresButKeepsOverrides covers the
// other way to empty a gradebook: the last component is deleted. An
// automatic report score left behind by an earlier state (a row the old
// recomputation never removed) goes; a manual override stays, because the
// teacher set it explicitly.
func TestDeletingTheLastComponentDropsReportScoresButKeepsOverrides(t *testing.T) {
	pg := dbtest.Start(t)
	fx := seedFixture(t, pg.AdminPool)
	ctx := context.Background()
	classmate := seedClassmate(t, pg.AdminPool, fx)

	schoolModule := school.Register(pg.AppPool, tenant.ModeSingle, nil)
	svc := Register(Dependencies{Pool: pg.AppPool, Years: schoolModule.Service, Clock: clock.Real{}}).Service
	term := uuid.NullUUID{UUID: fx.termID, Valid: true}

	qz, err := svc.CreateComponent(ctx, fx.tenantID, fx.teacherID, true, service.ComponentInput{
		ClassID: fx.classID, SubjectID: fx.subjectID, TermID: term, Code: "QZ1", Kind: domain.KindFormative, Weight: 1,
	})
	require.NoError(t, err)
	score := 80.0
	_, err = svc.SaveScores(ctx, fx.tenantID, qz.ID, fx.teacherID, true, []service.ScoreEntry{
		{StudentUserID: fx.studentID, Score: &score}, {StudentUserID: classmate, Score: &score},
	})
	require.NoError(t, err)
	manual := 75.0
	_, err = svc.SetManualScore(ctx, fx.tenantID, fx.teacherID, true, fx.classID, fx.subjectID, classmate, term, &manual)
	require.NoError(t, err)

	// A stale automatic row of the kind the old recomputation left behind:
	// the grades go without a recompute.
	_, err = pg.AdminPool.Exec(ctx, `delete from grades where tenant_id = $1 and component_id = $2`, fx.tenantID, qz.ID)
	require.NoError(t, err)
	require.Contains(t, reportScoreRows(t, pg.AdminPool, fx), fx.studentID)

	require.NoError(t, svc.DeleteComponent(ctx, fx.tenantID, qz.ID, fx.teacherID, true))

	rows := reportScoreRows(t, pg.AdminPool, fx)
	require.NotContains(t, rows, fx.studentID, "deleting the last component drops the automatic report score")
	require.Contains(t, rows, classmate, "a manual override survives recomputation")
	require.InDelta(t, 75, rows[classmate], 0.001)
}

// TestChangingAComponentWeightRecomputesTheReportScore keeps the report
// score in step with the gradebook average when a teacher reweighs a
// component: the average is computed on the fly from the weights, so the
// stored report score must follow.
func TestChangingAComponentWeightRecomputesTheReportScore(t *testing.T) {
	pg := dbtest.Start(t)
	fx := seedFixture(t, pg.AdminPool)
	ctx := context.Background()

	schoolModule := school.Register(pg.AppPool, tenant.ModeSingle, nil)
	svc := Register(Dependencies{Pool: pg.AppPool, Years: schoolModule.Service, Clock: clock.Real{}}).Service
	term := uuid.NullUUID{UUID: fx.termID, Valid: true}

	input := func(code string, weight float64) service.ComponentInput {
		return service.ComponentInput{ClassID: fx.classID, SubjectID: fx.subjectID, TermID: term, Code: code, Kind: domain.KindFormative, Weight: weight}
	}
	a, err := svc.CreateComponent(ctx, fx.tenantID, fx.teacherID, true, input("TG1", 1))
	require.NoError(t, err)
	b, err := svc.CreateComponent(ctx, fx.tenantID, fx.teacherID, true, input("TG2", 1))
	require.NoError(t, err)
	low, high := 60.0, 90.0
	_, err = svc.SaveScores(ctx, fx.tenantID, a.ID, fx.teacherID, true, []service.ScoreEntry{{StudentUserID: fx.studentID, Score: &low}})
	require.NoError(t, err)
	_, err = svc.SaveScores(ctx, fx.tenantID, b.ID, fx.teacherID, true, []service.ScoreEntry{{StudentUserID: fx.studentID, Score: &high}})
	require.NoError(t, err)
	require.InDelta(t, 75, reportScoreRows(t, pg.AdminPool, fx)[fx.studentID], 0.001)

	_, err = svc.UpdateComponent(ctx, fx.tenantID, b.ID, fx.teacherID, true, input("TG2", 2))
	require.NoError(t, err)
	require.InDelta(t, 80, reportScoreRows(t, pg.AdminPool, fx)[fx.studentID], 0.001)
}

// TestClearingAnOverrideRestoresTheAutomaticScore: a student with grades
// gets their weighted average back once the teacher clears an override.
func TestClearingAnOverrideRestoresTheAutomaticScore(t *testing.T) {
	pg := dbtest.Start(t)
	fx := seedFixture(t, pg.AdminPool)
	ctx := context.Background()

	schoolModule := school.Register(pg.AppPool, tenant.ModeSingle, nil)
	svc := Register(Dependencies{Pool: pg.AppPool, Years: schoolModule.Service, Clock: clock.Real{}}).Service
	term := uuid.NullUUID{UUID: fx.termID, Valid: true}

	tg, err := svc.CreateComponent(ctx, fx.tenantID, fx.teacherID, true, service.ComponentInput{
		ClassID: fx.classID, SubjectID: fx.subjectID, TermID: term, Code: "TG1", Kind: domain.KindFormative, Weight: 1,
	})
	require.NoError(t, err)
	score := 82.0
	_, err = svc.SaveScores(ctx, fx.tenantID, tg.ID, fx.teacherID, true, []service.ScoreEntry{{StudentUserID: fx.studentID, Score: &score}})
	require.NoError(t, err)

	manual := 70.0
	result, err := svc.SetManualScore(ctx, fx.tenantID, fx.teacherID, true, fx.classID, fx.subjectID, fx.studentID, term, &manual)
	require.NoError(t, err)
	require.NotNil(t, result)
	require.InDelta(t, 70, result.FinalScore, 0.001)

	// grades-discipline-R2: the gradebook names the override apart from the
	// report score, so the edit form opens on it instead of an empty field
	// (whose plain Save removed the override).
	book, err := svc.Gradebook(ctx, fx.tenantID, fx.teacherID, true, service.GradebookQuery{
		ClassID: fx.classID, SubjectID: fx.subjectID, TermID: term,
	})
	require.NoError(t, err)
	student := gradebookStudent(t, book, fx.studentID)
	require.NotNil(t, student.ReportScore)
	require.InDelta(t, 70, *student.ReportScore, 0.001)
	require.NotNil(t, student.ManualScore, "the override is listed on its own")
	require.InDelta(t, 70, *student.ManualScore, 0.001)

	result, err = svc.SetManualScore(ctx, fx.tenantID, fx.teacherID, true, fx.classID, fx.subjectID, fx.studentID, term, nil)
	require.NoError(t, err)
	require.NotNil(t, result, "a student with grades keeps a report score")
	require.Nil(t, result.ManualScore)
	require.InDelta(t, 82, result.FinalScore, 0.001)
	require.InDelta(t, 82, reportScoreRows(t, pg.AdminPool, fx)[fx.studentID], 0.001)

	book, err = svc.Gradebook(ctx, fx.tenantID, fx.teacherID, true, service.GradebookQuery{
		ClassID: fx.classID, SubjectID: fx.subjectID, TermID: term,
	})
	require.NoError(t, err)
	student = gradebookStudent(t, book, fx.studentID)
	require.NotNil(t, student.ReportScore)
	require.InDelta(t, 82, *student.ReportScore, 0.001)
	require.Nil(t, student.ManualScore, "an automatic report score has no override")
}
