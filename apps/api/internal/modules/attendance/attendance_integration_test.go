package attendance

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go/modules/postgres"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/events"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/migrator"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// startTestPostgres mirrors cmd/api/integration_test.go's helper of the
// same name: a real Postgres 16 in Docker, every migration applied, ready
// for the service layer under test. Every test here skips instead of
// failing when Docker is not reachable, and skips entirely under
// `go test -short`.
func startTestPostgres(t *testing.T) *pgxpool.Pool {
	t.Helper()
	if testing.Short() {
		t.Skip("skipping integration test in -short mode")
	}

	ctx := context.Background()
	container, err := postgres.Run(ctx, "postgres:16-alpine",
		postgres.WithDatabase("newsekolah"),
		postgres.WithUsername("newsekolah"),
		postgres.WithPassword("newsekolah"),
		postgres.BasicWaitStrategies(),
	)
	if err != nil {
		t.Skipf("docker not available, skipping integration test: %v", err)
	}
	t.Cleanup(func() { _ = container.Terminate(context.Background()) })

	dsn, err := container.ConnectionString(ctx, "sslmode=disable")
	require.NoError(t, err)

	pool, err := database.NewPool(ctx, dsn)
	require.NoError(t, err)
	t.Cleanup(pool.Close)

	require.NoError(t, migrator.UpAll(ctx, dsn, pool))
	return pool
}

// noopPerms satisfies authz.PermissionsProvider for scheduling.Register,
// whose transport layer these tests never exercise (they call
// service.Service methods directly, constructing service.Actor by hand
// instead of going through an HTTP handler's authz.Authorize step).
type noopPerms struct{}

func (noopPerms) EffectivePermissions(context.Context, uuid.UUID, uuid.UUID) (authz.Set, error) {
	return authz.NewSet(), nil
}

// buildService wires a real attendance/service.Service against pool, using
// the school and scheduling modules' own exported readers exactly as
// cmd/api/wire.go does, so this test exercises the same composition
// production uses instead of a hand-rolled substitute.
func buildService(pool *pgxpool.Pool) *service.Service {
	schoolModule := school.Register(pool, tenant.ModeSingle)
	eventBus := events.NewBus()
	schedulingModule := scheduling.Register(pool, eventBus, noopPerms{})
	repo := repository.New(pool)
	return service.New(
		pool, repo, schoolModule.Service, schedulingModule.ScheduleReader, schedulingModule.AccessChecker, schedulingModule.JournalService,
		NoOpBlocker{}, NoOpOverrider{}, NoOpViolationRecorder{}, NoOpDisciplineReader{}, nil, nil, nil,
	)
}

// world is one fully seeded tenant: a class with two students, a subject,
// one all-day period (so "today" stays inside the save window whenever the
// test runs), and a teacher who also holds the class's homeroom
// duty. scheduleToday and scheduleYesterday cover the same class/subject/
// teacher/period but on today's and yesterday's day_of_week respectively,
// so a test can open a session whose save window is still open or already
// closed just by picking which schedule to use.
type world struct {
	tenantID, yearID, classID, subjectID uuid.UUID
	teacherID, otherTeacherID            uuid.UUID
	student1ID, student2ID               uuid.UUID
	scheduleTodayID, scheduleYesterdayID uuid.UUID
	today, yesterday                     time.Time
}

// seedWorld creates one independent tenant's worth of fixture data via raw
// gen/db calls (and a few direct inserts for tables the academic module,
// built in a parallel worktree, does not yet expose a sqlc write query
// for: grade_levels, subjects, period_templates, periods, school_days,
// enrollments). pool bypasses RLS (the migration role is a superuser, per
// cmd/api/integration_test.go's TestTenantIsolationRLS doc comment), so
// these inserts need no tenant transaction.
func seedWorld(t *testing.T, ctx context.Context, pool *pgxpool.Pool, slug string) world {
	t.Helper()
	q := db.New(pool)
	w := world{}

	tn, err := q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: slug, Name: slug, EducationLevel: "sma", Timezone: "UTC", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)
	w.tenantID = tn.ID

	year, err := q.CreateAcademicYear(ctx, db.CreateAcademicYearParams{
		TenantID: w.tenantID, Label: "2025/2026",
		StartsOn: database.Date(time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)),
		EndsOn:   database.Date(time.Date(2030, 1, 1, 0, 0, 0, 0, time.UTC)),
		IsActive: true,
	})
	require.NoError(t, err)
	w.yearID = year.ID

	var gradeLevelID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`insert into grade_levels (tenant_id, code, name, sequence) values ($1, 'X', 'Kelas X', 1) returning id`,
		w.tenantID,
	).Scan(&gradeLevelID))

	class, err := q.CreateClass(ctx, db.CreateClassParams{TenantID: w.tenantID, AcademicYearID: w.yearID, GradeLevelID: gradeLevelID, Name: "X-A"})
	require.NoError(t, err)
	w.classID = class.ID

	require.NoError(t, pool.QueryRow(ctx,
		`insert into subjects (tenant_id, code, name) values ($1, 'MTK', 'Matematika') returning id`, w.tenantID,
	).Scan(&w.subjectID))

	var templateID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`insert into period_templates (tenant_id, name) values ($1, 'Default') returning id`, w.tenantID,
	).Scan(&templateID))

	var periodID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`insert into periods (tenant_id, template_id, name, sequence, starts_at, ends_at) values ($1, $2, 'P1', 1, '00:01', '23:59') returning id`,
		w.tenantID, templateID,
	).Scan(&periodID))

	for day := int16(1); day <= 7; day++ {
		_, err := pool.Exec(ctx,
			`insert into school_days (tenant_id, academic_year_id, day_of_week, is_active) values ($1, $2, $3, true)`,
			w.tenantID, w.yearID, day,
		)
		require.NoError(t, err)
	}

	teacher, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: w.tenantID, Username: "teacher-" + slug, PasswordHash: "x", Name: "Teacher", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	w.teacherID = teacher.ID

	otherTeacher, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: w.tenantID, Username: "other-" + slug, PasswordHash: "x", Name: "Other Teacher", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	w.otherTeacherID = otherTeacher.ID

	student1, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: w.tenantID, Username: "student1-" + slug, PasswordHash: "x", Name: "Student One", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	w.student1ID = student1.ID

	student2, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: w.tenantID, Username: "student2-" + slug, PasswordHash: "x", Name: "Student Two", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	w.student2ID = student2.ID

	for _, studentID := range []uuid.UUID{w.student1ID, w.student2ID} {
		_, err := pool.Exec(ctx,
			`insert into enrollments (tenant_id, academic_year_id, student_user_id, class_id, status, joined_on) values ($1, $2, $3, $4, 'active', current_date)`,
			w.tenantID, w.yearID, studentID, w.classID,
		)
		require.NoError(t, err)
	}

	dutyType, err := q.CreateDutyType(ctx, db.CreateDutyTypeParams{TenantID: w.tenantID, Slug: "homeroom", Name: "Wali Kelas", ScopeKind: "class"})
	require.NoError(t, err)
	_, err = q.CreateDutyAssignment(ctx, db.CreateDutyAssignmentParams{
		TenantID: w.tenantID, AcademicYearID: w.yearID, DutyTypeID: dutyType.ID, UserID: w.teacherID,
		ScopeClassID: database.NullUUID(uuid.NullUUID{UUID: w.classID, Valid: true}),
		StartsOn:     database.Date(time.Now().AddDate(0, 0, -30)),
	})
	require.NoError(t, err)

	now := time.Now().UTC()
	w.today = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	w.yesterday = w.today.AddDate(0, 0, -1)

	scheduleToday, err := q.CreateSchedule(ctx, db.CreateScheduleParams{
		TenantID: w.tenantID, AcademicYearID: w.yearID, ClassID: w.classID, SubjectID: w.subjectID, TeacherUserID: w.teacherID,
		DayOfWeek: domain.IsoWeekday(w.today), StartPeriodID: periodID, EndPeriodID: periodID, StartSeq: 1, EndSeq: 1, Source: "admin",
	})
	require.NoError(t, err)
	w.scheduleTodayID = scheduleToday.ID

	scheduleYesterday, err := q.CreateSchedule(ctx, db.CreateScheduleParams{
		TenantID: w.tenantID, AcademicYearID: w.yearID, ClassID: w.classID, SubjectID: w.subjectID, TeacherUserID: w.teacherID,
		DayOfWeek: domain.IsoWeekday(w.yesterday), StartPeriodID: periodID, EndPeriodID: periodID, StartSeq: 1, EndSeq: 1, Source: "admin",
	})
	require.NoError(t, err)
	w.scheduleYesterdayID = scheduleYesterday.ID

	return w
}

func TestOpenSessionIsIdempotent(t *testing.T) {
	pool := startTestPostgres(t)
	ctx := context.Background()
	svc := buildService(pool)
	w := seedWorld(t, ctx, pool, "open-idem")

	actor := service.Actor{UserID: w.teacherID}

	first, err := svc.OpenSession(ctx, w.tenantID, actor, w.scheduleTodayID, w.today, domain.SaveModeNormal)
	require.NoError(t, err)
	require.Len(t, first.Roster, 2, "both enrolled students must appear on the roster")
	require.Equal(t, 1, first.MeetingNumber)

	second, err := svc.OpenSession(ctx, w.tenantID, actor, w.scheduleTodayID, w.today, domain.SaveModeNormal)
	require.NoError(t, err)
	require.Equal(t, first.Session.ID, second.Session.ID, "opening the same schedule+date twice must return the same session")
}

func TestSaveEntriesPolicyAndWindow(t *testing.T) {
	pool := startTestPostgres(t)
	ctx := context.Background()
	svc := buildService(pool)
	w := seedWorld(t, ctx, pool, "save-window")

	actor := service.Actor{UserID: w.teacherID}

	// Yesterday's session: the save window (period end + 0 grace, on
	// yesterday's date) has already passed.
	closedSession, err := svc.OpenSession(ctx, w.tenantID, actor, w.scheduleYesterdayID, w.yesterday, domain.SaveModeNormal)
	require.NoError(t, err)
	_, err = svc.SaveEntries(ctx, w.tenantID, actor, closedSession.Session.ID, service.SaveEntriesInput{
		Entries: []service.SaveEntryInput{{StudentUserID: w.student1ID, StatusCode: "H"}},
	})
	require.ErrorIs(t, err, domain.ErrSaveWindowClosed)

	// Today's session: still open.
	todaySession, err := svc.OpenSession(ctx, w.tenantID, actor, w.scheduleTodayID, w.today, domain.SaveModeNormal)
	require.NoError(t, err)

	// An unrecognized status code is rejected before anything is written.
	_, err = svc.SaveEntries(ctx, w.tenantID, actor, todaySession.Session.ID, service.SaveEntriesInput{
		Entries: []service.SaveEntryInput{{StudentUserID: w.student1ID, StatusCode: "ZZZ"}},
	})
	require.ErrorIs(t, err, domain.ErrInvalidStatusCode)

	// A valid save submits the session and materializes the daily summary
	// for both students in the same call.
	saved, err := svc.SaveEntries(ctx, w.tenantID, actor, todaySession.Session.ID, service.SaveEntriesInput{
		Entries: []service.SaveEntryInput{
			{StudentUserID: w.student1ID, StatusCode: "H"},
			{StudentUserID: w.student2ID, StatusCode: "S"},
		},
	})
	require.NoError(t, err)
	require.NotNil(t, saved.Session.SubmittedAt)

	summary, err := svc.GetStudentCalendarMonth(ctx, w.tenantID, w.student1ID, w.today.Format("2006-01"))
	require.NoError(t, err)
	var todaySummary *service.CalendarDay
	for i := range summary {
		if summary[i].Date.Equal(w.today) {
			todaySummary = &summary[i]
		}
	}
	require.NotNil(t, todaySummary, "today must appear in the student's calendar month")
	require.Equal(t, "H", todaySummary.StatusCode)
	require.Equal(t, 1, todaySummary.ExpectedSessions)
	require.Equal(t, 1, todaySummary.SubmittedSessions)
	require.True(t, todaySummary.Complete)

	// A resubmit with a different status, in correction mode, records a
	// correction row rather than silently overwriting history.
	correctorActor := service.Actor{UserID: w.teacherID, IsGlobalCorrector: true}
	_, err = svc.SaveEntries(ctx, w.tenantID, correctorActor, todaySession.Session.ID, service.SaveEntriesInput{
		Mode: domain.SaveModeCorrection, Reason: "salah input",
		Entries: []service.SaveEntryInput{{StudentUserID: w.student1ID, StatusCode: "A"}},
	})
	require.NoError(t, err)

	var correctionCount int
	require.NoError(t, pool.QueryRow(ctx,
		`select count(*) from attendance_corrections where tenant_id = $1 and old_status = 'H' and new_status = 'A'`, w.tenantID,
	).Scan(&correctionCount))
	require.Equal(t, 1, correctionCount, "changing an already-submitted entry must write a correction row")

	// Correction mode without a reason is rejected.
	_, err = svc.SaveEntries(ctx, w.tenantID, correctorActor, todaySession.Session.ID, service.SaveEntriesInput{
		Mode:    domain.SaveModeCorrection,
		Entries: []service.SaveEntryInput{{StudentUserID: w.student1ID, StatusCode: "H"}},
	})
	require.ErrorIs(t, err, domain.ErrCorrectionReasonRequired)

	// Correction mode by a teacher who is neither a global corrector nor
	// the class's homeroom teacher is forbidden.
	_, err = svc.SaveEntries(ctx, w.tenantID, service.Actor{UserID: w.otherTeacherID}, todaySession.Session.ID, service.SaveEntriesInput{
		Mode: domain.SaveModeCorrection, Reason: "salah input",
		Entries: []service.SaveEntryInput{{StudentUserID: w.student1ID, StatusCode: "H"}},
	})
	require.ErrorIs(t, err, domain.ErrCorrectionNotAllowed)

	// A student who does not belong to the class is rejected.
	_, err = svc.SaveEntries(ctx, w.tenantID, actor, todaySession.Session.ID, service.SaveEntriesInput{
		Entries: []service.SaveEntryInput{{StudentUserID: uuid.New(), StatusCode: "H"}},
	})
	require.ErrorIs(t, err, domain.ErrStudentNotInClass)
}

func TestHomeroomScopeForbidden(t *testing.T) {
	pool := startTestPostgres(t)
	ctx := context.Background()
	svc := buildService(pool)
	w := seedWorld(t, ctx, pool, "homeroom-scope")

	roster, err := svc.GetHomeroomAttendance(ctx, w.tenantID, service.Actor{UserID: w.teacherID}, w.today, service.HomeroomFilter{})
	require.NoError(t, err)
	require.Len(t, roster.Students, 2)

	_, err = svc.GetHomeroomAttendance(ctx, w.tenantID, service.Actor{UserID: w.otherTeacherID}, w.today, service.HomeroomFilter{})
	require.True(t, errors.Is(err, domain.ErrNotHomeroomTeacher), "a teacher without the homeroom duty must be forbidden, got %v", err)
}

func TestTenantIsolation(t *testing.T) {
	pool := startTestPostgres(t)
	ctx := context.Background()
	svc := buildService(pool)

	tenantA := seedWorld(t, ctx, pool, fmt.Sprintf("iso-a-%d", time.Now().UnixNano()))
	tenantB := seedWorld(t, ctx, pool, fmt.Sprintf("iso-b-%d", time.Now().UnixNano()))

	sessionB, err := svc.OpenSession(ctx, tenantB.tenantID, service.Actor{UserID: tenantB.teacherID}, tenantB.scheduleTodayID, tenantB.today, domain.SaveModeNormal)
	require.NoError(t, err)

	// Tenant A's own actor, asking for tenant B's session ID under tenant
	// A's tenant scope, must find nothing -- every attendance query is
	// filtered by tenant_id, so a cross-tenant ID can never resolve.
	_, err = svc.GetSessionDetail(ctx, tenantA.tenantID, service.Actor{UserID: tenantA.teacherID, CanViewAll: true}, sessionB.Session.ID)
	require.ErrorIs(t, err, domain.ErrSessionNotFound)
}
