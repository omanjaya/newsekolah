package wiring

import (
	"context"
	"os"
	"sort"
	"strconv"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics"
	analyticsdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics/domain"
	analyticsrepository "github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics/repository"
	analyticsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance"
	attendanceservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline"
	disciplineservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading"
	gradingservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits"
	permitsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/events"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// The early-warning recompute used to read every signal one student at a
// time through the attendance, discipline and grading modules; it now reads
// them for 500 students at a time. These tests prove the two give the same
// answers on a seeded school: the original per-student reads are kept below
// as a reference ("legacy"), run against the same database, and compared
// with the batch reads and with what Recompute stores.

type analyticsStack struct {
	attendance *attendanceservice.Service
	discipline *disciplineservice.Service
	grading    *gradingservice.Service
	analytics  *analytics.Module
	repo       *analyticsrepository.Repository
}

type allowNothing struct{}

func (allowNothing) EffectivePermissions(context.Context, uuid.UUID, uuid.UUID) (authz.Set, error) {
	return authz.NewSet(), nil
}

func buildAnalyticsStack(pool *pgxpool.Pool, now time.Time) analyticsStack {
	schoolModule := school.Register(pool, tenant.ModeSingle, nil)
	bus := events.NewBus()
	schedulingModule := scheduling.Register(pool, bus, allowNothing{})
	permitsModule := permits.Register(permits.Dependencies{
		Pool: pool, Years: schoolModule.Service, Clock: clock.Real{},
		Config: permitsservice.DefaultConfig([]byte("01234567890123456789012345678901"), ""),
	})
	attendanceModule := attendance.Register(attendance.Dependencies{
		Pool: pool, Bus: bus, Years: schoolModule.Service,
		Schedules: schedulingModule.ScheduleReader, Access: schedulingModule.AccessChecker, Journals: schedulingModule.JournalService,
		Perms: allowNothing{}, Overrider: PermitsOverrider{Svc: permitsModule.Service},
	})
	disciplineModule := discipline.Register(discipline.Dependencies{
		Pool: pool, Years: schoolModule.Service, Clock: clock.Real{}, Config: disciplineservice.DefaultConfig(""),
	})
	gradingModule := grading.Register(grading.Dependencies{Pool: pool, Years: schoolModule.Service, Clock: clock.Real{}})
	analyticsModule := analytics.Register(analytics.Dependencies{
		Pool: pool, Years: schoolModule.Service,
		Attendance: AnalyticsAttendance{Svc: attendanceModule.Service},
		Discipline: AnalyticsDiscipline{Svc: disciplineModule.Service},
		Grading:    AnalyticsGrading{Svc: gradingModule.Service},
		Clock:      clock.Frozen{At: now},
	})
	return analyticsStack{
		attendance: attendanceModule.Service, discipline: disciplineModule.Service, grading: gradingModule.Service,
		analytics: analyticsModule, repo: analyticsrepository.New(pool),
	}
}

// legacySignals is the per-student signal read the recompute used before
// it was made tenant-level, kept verbatim as the reference: attendance by
// month through the calendar, discipline through the student card, grading
// through the student's own grades view.
type legacySignals struct {
	stack analyticsStack
	// months caches attendance month reads, so the all-dates comparison can
	// reuse what the timed run already read.
	months map[string][]legacyDay
}

type legacyDay struct {
	date time.Time
	code string
}

func (l *legacySignals) monthlySummary(ctx context.Context, tenantID, studentID uuid.UUID, month string) ([]legacyDay, error) {
	key := studentID.String() + month
	if days, ok := l.months[key]; ok {
		return days, nil
	}
	days, _, err := l.stack.attendance.GetMonthlySummary(ctx, tenantID, studentID, month)
	if err != nil {
		return nil, err
	}
	out := make([]legacyDay, len(days))
	for i, d := range days {
		out[i] = legacyDay{date: d.Date, code: d.StatusCode}
	}
	l.months[key] = out
	return out, nil
}

// attendanceWindow is the original month-by-month rolling window.
func (l *legacySignals) attendanceWindow(ctx context.Context, tenantID, studentID uuid.UUID, windowDays int, now time.Time) (considered, absent int, ok bool) {
	const maxMonthsBack = 3
	var days []legacyDay
	cursor := now
	for i := 0; i < maxMonthsBack && len(days) < windowDays; i++ {
		monthDays, err := l.monthlySummary(ctx, tenantID, studentID, cursor.Format("2006-01"))
		if err != nil {
			break
		}
		days = append(days, monthDays...)
		cursor = cursor.AddDate(0, -1, 0)
	}
	if len(days) == 0 {
		return 0, 0, false
	}
	sort.Slice(days, func(i, j int) bool { return days[i].date.After(days[j].date) })
	limit := min(windowDays, len(days))
	for _, d := range days[:limit] {
		if d.code == "" {
			continue
		}
		considered++
		if d.code == "absent" {
			absent++
		}
	}
	return considered, absent, considered > 0
}

func (l *legacySignals) disciplineSummary(ctx context.Context, tenantID, studentID uuid.UUID) (analyticsservice.DisciplineSummary, error) {
	summary, err := l.stack.discipline.StudentSummary(ctx, tenantID, studentID)
	if err != nil {
		return analyticsservice.DisciplineSummary{}, err
	}
	active := 0
	for _, r := range summary.Records {
		if !r.IsVoided() {
			active++
		}
	}
	return analyticsservice.DisciplineSummary{ActiveViolationCount: active, TotalPoints: summary.TotalPoints, WarningLetterCount: len(summary.Letters)}, nil
}

func legacyAverageReportScore(subjects []gradingservice.MySubjectGrade) (float64, bool) {
	sum, count := 0.0, 0
	for _, s := range subjects {
		if s.ReportScore == nil {
			continue
		}
		sum += *s.ReportScore
		count++
	}
	if count == 0 {
		return 0, false
	}
	return sum / float64(count), true
}

func (l *legacySignals) reportTrend(ctx context.Context, tenantID, studentID uuid.UUID) (analyticsservice.GradeTrend, error) {
	g := l.stack.grading
	current, err := g.MyGrades(ctx, tenantID, studentID, uuid.NullUUID{})
	if err != nil {
		return analyticsservice.GradeTrend{}, err
	}
	currentAvg, ok := legacyAverageReportScore(current.Subjects)
	if !ok {
		return analyticsservice.GradeTrend{}, nil
	}
	previousTerm, found, err := g.PreviousTerm(ctx, tenantID, current.Term.ID)
	if err != nil || !found {
		return analyticsservice.GradeTrend{}, err
	}
	previous, err := g.MyGrades(ctx, tenantID, studentID, uuid.NullUUID{UUID: previousTerm.ID, Valid: true})
	if err != nil {
		return analyticsservice.GradeTrend{}, err
	}
	previousAvg, ok := legacyAverageReportScore(previous.Subjects)
	if !ok {
		return analyticsservice.GradeTrend{}, nil
	}
	return analyticsservice.GradeTrend{Available: true, PreviousAverage: previousAvg, CurrentAverage: currentAvg}, nil
}

func (l *legacySignals) build(ctx context.Context, tenantID, studentID uuid.UUID, policy analyticsdomain.Policy, now time.Time) analyticsdomain.Signals {
	var signals analyticsdomain.Signals
	if considered, absent, ok := l.attendanceWindow(ctx, tenantID, studentID, policy.WindowDays, now); ok {
		signals.HasAttendance = true
		signals.ConsideredDays = considered
		signals.AbsentDays = absent
	}
	if summary, err := l.disciplineSummary(ctx, tenantID, studentID); err == nil {
		signals.ActiveViolationCount = summary.ActiveViolationCount
		signals.DisciplinePoints = summary.TotalPoints
		signals.WarningLetterCount = summary.WarningLetterCount
	}
	if trend, err := l.reportTrend(ctx, tenantID, studentID); err == nil && trend.Available {
		signals.HasGradeTrend = true
		signals.PreviousAverage = trend.PreviousAverage
		signals.CurrentAverage = trend.CurrentAverage
	}
	return signals
}

// legacyRecompute is the original Recompute: one tenant transaction, a
// signal read and an upsert per student.
func (l *legacySignals) recompute(ctx context.Context, pool *pgxpool.Pool, w analyticsWorld, now time.Time) error {
	svc := l.stack.analytics.Service
	policy, err := svc.Policy(ctx, w.tenantID)
	if err != nil {
		return err
	}
	return database.WithTenantTx(ctx, pool, w.tenantID, func(ctx context.Context) error {
		for _, id := range w.studentIDs {
			signals := l.build(ctx, w.tenantID, id, policy, now)
			scored := analyticsdomain.Score(signals, policy)
			err := l.stack.repo.UpsertResult(ctx, w.tenantID, analyticsservice.StoredResult{
				AcademicYearID: w.yearID, StudentUserID: id, ClassID: uuid.NullUUID{},
				Level: scored.Level, Score: scored.Score, Signals: signals, Reasons: scored.Reasons,
				PolicyVersion: policy.Version, ComputedAt: now,
			})
			if err != nil {
				return err
			}
		}
		return nil
	})
}

// statementCalls is the number of statements PostgreSQL has executed in
// this database since the last reset, or -1 without pg_stat_statements.
func statementCalls(t *testing.T, admin *pgxpool.Pool) int64 {
	t.Helper()
	ctx := context.Background()
	if _, err := admin.Exec(ctx, `create extension if not exists pg_stat_statements`); err != nil {
		return -1
	}
	var calls int64
	err := admin.QueryRow(ctx, `
		select coalesce(sum(calls), 0)::bigint from pg_stat_statements
		where dbid = (select oid from pg_database where datname = current_database())
		  and query not ilike '%pg_stat_statements%'
		  and query not in ('BEGIN', 'COMMIT', 'ROLLBACK')
		  and query not ilike 'select set_config(%'
		  and query not ilike '%FROM ONLY%'`).Scan(&calls)
	if err != nil {
		return -1
	}
	return calls
}

func resetStatementCalls(admin *pgxpool.Pool) {
	_, _ = admin.Exec(context.Background(), `select pg_stat_statements_reset()`)
}

// listResults reads the stored results the way the list screen does, inside
// a tenant transaction (the table is row-level secured).
func listResults(ctx context.Context, pool *pgxpool.Pool, stack analyticsStack, w analyticsWorld) ([]analyticsservice.StoredResult, error) {
	var out []analyticsservice.StoredResult
	err := database.WithTenantTx(ctx, pool, w.tenantID, func(ctx context.Context) error {
		var err error
		out, err = stack.repo.ListResults(ctx, w.tenantID, w.yearID, uuid.NullUUID{})
		return err
	})
	return out, err
}

func envInt(name string, fallback int) int {
	if v, err := strconv.Atoi(os.Getenv(name)); err == nil && v > 0 {
		return v
	}
	return fallback
}

func TestAnalyticsRecomputeMatchesPerStudentReads(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	students := envInt("ANALYTICS_EQUIV_STUDENTS", 240)
	classes := envInt("ANALYTICS_EQUIV_CLASSES", 8)
	now := time.Date(2026, 10, 28, 6, 0, 0, 0, time.UTC)

	w := seedAnalyticsWorld(t, pg.AdminPool, students, classes, now)
	stack := buildAnalyticsStack(pg.AppPool, now)
	legacy := &legacySignals{stack: stack, months: map[string][]legacyDay{}}
	_ = statementCalls(t, pg.AdminPool) // creates the extension before measuring

	// Before: the original per-student recompute.
	resetStatementCalls(pg.AdminPool)
	start := time.Now()
	require.NoError(t, legacy.recompute(ctx, pg.AppPool, w, now))
	legacyTook := time.Since(start)
	legacyCalls := statementCalls(t, pg.AdminPool)
	legacyRows, err := listResults(ctx, pg.AppPool, stack, w)
	require.NoError(t, err)
	require.Len(t, legacyRows, students)

	// After: the tenant-level recompute (which also stores class ids).
	resetStatementCalls(pg.AdminPool)
	start = time.Now()
	scored, err := stack.analytics.Service.Recompute(ctx, w.tenantID)
	require.NoError(t, err)
	batchTook := time.Since(start)
	batchCalls := statementCalls(t, pg.AdminPool)
	require.Equal(t, students, scored)
	batchRows, err := listResults(ctx, pg.AppPool, stack, w)
	require.NoError(t, err)
	require.Len(t, batchRows, students)

	t.Logf("students=%d classes=%d", students, classes)
	t.Logf("before (per student): %d statements, %s", legacyCalls, legacyTook.Round(time.Millisecond))
	t.Logf("after  (batched):     %d statements, %s", batchCalls, batchTook.Round(time.Millisecond))

	legacyByStudent := map[uuid.UUID]analyticsservice.StoredResult{}
	for _, r := range legacyRows {
		legacyByStudent[r.StudentUserID] = r
	}
	levels := map[analyticsdomain.Level]int{}
	withAttendance, withDiscipline, withTrend := 0, 0, 0
	for _, got := range batchRows {
		want, ok := legacyByStudent[got.StudentUserID]
		require.True(t, ok)
		require.Equal(t, want.Signals, got.Signals, "signals of %s", got.StudentUserID)
		require.Equal(t, want.Level, got.Level, "level of %s", got.StudentUserID)
		require.Equal(t, want.Score, got.Score, "score of %s", got.StudentUserID)
		require.Equal(t, want.Reasons, got.Reasons, "reasons of %s", got.StudentUserID)
		require.Equal(t, want.PolicyVersion, got.PolicyVersion)
		require.True(t, got.ClassID.Valid, "the batch path stores the student's class")

		levels[got.Level]++
		if got.Signals.HasAttendance {
			withAttendance++
		}
		if got.Signals.DisciplinePoints > 0 {
			withDiscipline++
		}
		if got.Signals.HasGradeTrend {
			withTrend++
		}
	}
	t.Logf("levels=%v attendance=%d discipline=%d gradeTrend=%d", levels, withAttendance, withDiscipline, withTrend)
	require.Greater(t, withAttendance, 0)
	require.Greater(t, withDiscipline, 0)
	require.Greater(t, withTrend, 0)
	require.Greater(t, levels[analyticsdomain.LevelWatch]+levels[analyticsdomain.LevelAtRisk], 0, "the fixture must produce students at risk")
}

// TestDayStatusesMatchStudentCalendar compares, for every student and for
// users with no enrollment, the batch daily status of every date in the
// seeded history with what the student calendar reports for the same day,
// including days with a summary row, an issued leave letter, a live
// computation and no school at all.
func TestDayStatusesMatchStudentCalendar(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	students := envInt("ANALYTICS_EQUIV_STUDENTS", 240)
	now := time.Date(2026, 10, 28, 6, 0, 0, 0, time.UTC)

	w := seedAnalyticsWorld(t, pg.AdminPool, students, 8, now)
	stack := buildAnalyticsStack(pg.AppPool, now)

	// Every calendar day of September and October, past and future.
	var dates []time.Time
	for d := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC); d.Before(time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)); d = d.AddDate(0, 0, 1) {
		dates = append(dates, d)
	}
	ids := append(append([]uuid.UUID{}, w.studentIDs...), w.ghostIDs...)

	rows, err := stack.attendance.DayStatusesForStudents(ctx, w.tenantID, ids, dates)
	require.NoError(t, err)
	require.Len(t, rows, len(ids)*len(dates))
	got := map[uuid.UUID]map[string]string{}
	for _, r := range rows {
		if got[r.StudentUserID] == nil {
			got[r.StudentUserID] = map[string]string{}
		}
		got[r.StudentUserID][r.Date.Format("2006-01-02")] = r.StatusCode
	}

	codes := map[string]int{}
	for _, id := range ids {
		for _, month := range []string{"2026-09", "2026-10"} {
			days, _, err := stack.attendance.GetMonthlySummary(ctx, w.tenantID, id, month)
			require.NoError(t, err)
			for _, d := range days {
				key := d.Date.Format("2006-01-02")
				require.Equal(t, d.StatusCode, got[id][key], "student %s on %s", id, key)
				codes[d.StatusCode]++
			}
		}
	}
	t.Logf("compared %d student-days; status mix %v", len(ids)*len(dates), codes)
	for _, code := range []string{"H", "A", "S", "I", "D", "NONE", "INCOMPLETE"} {
		require.Greater(t, codes[code], 0, "the fixture should exercise status %s", code)
	}
}

// TestDisciplineAndGradingBatchesMatchPerStudentReads compares the batch
// discipline totals and report trends with the per-student reads.
func TestDisciplineAndGradingBatchesMatchPerStudentReads(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	now := time.Date(2026, 10, 28, 6, 0, 0, 0, time.UTC)

	w := seedAnalyticsWorld(t, pg.AdminPool, 240, 8, now)
	stack := buildAnalyticsStack(pg.AppPool, now)
	legacy := &legacySignals{stack: stack, months: map[string][]legacyDay{}}
	ids := append(append([]uuid.UUID{}, w.studentIDs...), w.ghostIDs...)

	totals, err := stack.discipline.RiskTotalsForStudents(ctx, w.tenantID, ids)
	require.NoError(t, err)
	require.Len(t, totals, len(ids), "every given student gets a row")
	withPoints, withLetters := 0, 0
	for _, row := range totals {
		want, err := legacy.disciplineSummary(ctx, w.tenantID, row.StudentUserID)
		require.NoError(t, err)
		require.Equal(t, want.ActiveViolationCount, row.ActiveViolations)
		require.Equal(t, want.TotalPoints, row.Points)
		require.Equal(t, want.WarningLetterCount, row.WarningLetters)
		if row.Points > 0 {
			withPoints++
		}
		if row.WarningLetters > 0 {
			withLetters++
		}
	}
	require.Greater(t, withPoints, 0)
	require.Greater(t, withLetters, 0)

	trends, err := stack.grading.ReportTrendsForStudents(ctx, w.tenantID, ids)
	require.NoError(t, err)
	require.Len(t, trends, len(ids))
	available := 0
	for _, id := range ids {
		want, err := legacy.reportTrend(ctx, w.tenantID, id)
		require.NoError(t, err)
		got := trends[id]
		require.Equal(t, want.Available, got.Available, "student %s", id)
		require.Equal(t, want.PreviousAverage, got.PreviousAverage, "student %s", id)
		require.Equal(t, want.CurrentAverage, got.CurrentAverage, "student %s", id)
		if got.Available {
			available++
		}
	}
	require.Greater(t, available, 0)
	require.Less(t, available, len(ids), "some students must have no trend")
}
