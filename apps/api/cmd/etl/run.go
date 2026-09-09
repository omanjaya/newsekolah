package main

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

// migrate reads every table in dependency order from source and writes it
// into the target tenant, inside one transaction (committed unless
// cfg.DryRun, per runInTransaction's contract), and returns the finished
// difference report regardless of whether individual rows failed -- only an
// error that prevents the run from producing a report at all (a bad
// connection, a missing tenant, a malformed --source-year) is returned as an
// error rather than folded into the report.
func migrate(ctx context.Context, cfg Config, source *Source, pool *pgxpool.Pool, clk clock.Clock, logger *slog.Logger) (*Report, error) {
	tenantID, err := resolveTenantID(ctx, pool, cfg.TenantSlug)
	if err != nil {
		return nil, err
	}

	sionYearID, err := source.resolveAcademicYearID(cfg.SourceYear, cfg.SourceSemester)
	if err != nil {
		return nil, err
	}

	data, err := fetchAll(source, sionYearID)
	if err != nil {
		return nil, err
	}

	report := NewReport(clk, cfg.TenantSlug, fmt.Sprintf("%s %s", cfg.SourceYear, cfg.SourceSemester), cfg.DryRun)

	err = runInTransaction(ctx, pool, tenantID, cfg.DryRun, func(st *Store) error {
		return runMigrationSteps(ctx, st, tenantID, cfg, source, sionYearID, data, report)
	})
	if err != nil {
		return nil, fmt.Errorf("migration transaction: %w", err)
	}

	report.Finish()
	logger.Info("etl migration finished", "tenant", cfg.TenantSlug, "dry_run", cfg.DryRun)
	return report, nil
}

// resolveTenantID looks up the target tenant by slug directly (tenants has
// no row-level security: it is the root table every tenant-scoped table
// hangs off of), before app.tenant_id even has a value to set.
func resolveTenantID(ctx context.Context, pool *pgxpool.Pool, slug string) (uuid.UUID, error) {
	var id uuid.UUID
	err := pool.QueryRow(ctx, `select id from tenants where slug = $1`, slug).Scan(&id)
	if err != nil {
		return uuid.Nil, fmt.Errorf("tenant %q not found: %w", slug, err)
	}
	return id, nil
}

// sourceData holds every row fetched from SION for the selected academic
// year, read once up front so the transactional migration steps never touch
// the MySQL connection (keeping the target transaction's lifetime short and
// making a dry run's cost predictable).
type sourceData struct {
	users               []SionUser
	classes             []SionClass
	subjects            []SionSubject
	enrollments         []SionEnrollment
	teachingAssignments []SionTeachingAssignment
	teacherDuties       []SionDutyAssignment
	employeeDuties      []SionDutyAssignment
	periods             []SionPeriod
	schedules           []SionTeachingSchedule
	sessions            []SionAttendanceSession
	entries             []SionAttendanceEntry
	violationTypes      []SionViolationType
	violationRecords    []SionViolationRecord
	warningLetters      []SionWarningLetter
	leaveRequests       []SionLeaveRequest
}

func fetchAll(source *Source, sionYearID string) (sourceData, error) {
	var d sourceData
	var err error
	steps := []struct {
		name string
		fn   func() error
	}{
		{"users", func() (e error) { d.users, e = source.FetchUsers(); return }},
		{"classes", func() (e error) { d.classes, e = source.FetchClasses(sionYearID); return }},
		{"subjects", func() (e error) { d.subjects, e = source.FetchSubjects(sionYearID); return }},
		{"enrollments", func() (e error) { d.enrollments, e = source.FetchEnrollments(sionYearID); return }},
		{"teaching assignments", func() (e error) { d.teachingAssignments, e = source.FetchTeachingAssignments(sionYearID); return }},
		{"teacher duty assignments", func() (e error) { d.teacherDuties, e = source.FetchTeacherDutyAssignments(sionYearID); return }},
		{"employee duty assignments", func() (e error) { d.employeeDuties, e = source.FetchEmployeeDutyAssignments(sionYearID); return }},
		{"periods", func() (e error) { d.periods, e = source.FetchPeriods(sionYearID); return }},
		{"teaching schedules", func() (e error) { d.schedules, e = source.FetchTeachingSchedules(sionYearID); return }},
		{"attendance sessions", func() (e error) { d.sessions, e = source.FetchAttendanceSessions(sionYearID); return }},
		{"attendance entries", func() (e error) { d.entries, e = source.FetchAttendanceEntries(sionYearID); return }},
		{"violation types", func() (e error) { d.violationTypes, e = source.FetchViolationTypes(sionYearID); return }},
		{"violation records", func() (e error) { d.violationRecords, e = source.FetchViolationRecords(sionYearID); return }},
		{"warning letters", func() (e error) { d.warningLetters, e = source.FetchWarningLetters(sionYearID); return }},
		{"leave requests", func() (e error) { d.leaveRequests, e = source.FetchIssuedLeaveRequests(sionYearID); return }},
	}
	for _, step := range steps {
		if err = step.fn(); err != nil {
			return sourceData{}, fmt.Errorf("fetch %s: %w", step.name, err)
		}
	}
	return d, nil
}

// runMigrationSteps runs every migration step against the already-open
// transaction, in the dependency order docs/13-etl-sion.md documents: roles
// and duty types before users, users before enrollments and assignments,
// classes and subjects before enrollments and teaching assignments, periods
// before schedules, schedules before attendance.
func runMigrationSteps(ctx context.Context, st *Store, tenantID uuid.UUID, cfg Config, source *Source, sionYearID string, d sourceData, report *Report) error {
	yearStat := report.Table("academic_years")
	yearStat.Read++
	academicYearID, created, err := st.ensureAcademicYear(ctx, tenantID, cfg.SourceYear)
	if err != nil {
		yearStat.RecordFailure(cfg.SourceYear, err.Error())
		return fmt.Errorf("ensure academic year: %w", err)
	}
	if created {
		yearStat.Created++
	} else {
		yearStat.Skipped++
	}

	roleIDs, dutyIDs, err := st.ensureRolesAndDuties(ctx, tenantID)
	if err != nil {
		return fmt.Errorf("ensure roles and duties: %w", err)
	}

	users, err := st.migrateUsers(ctx, tenantID, roleIDs, d.users, report.Table("users"))
	if err != nil {
		return fmt.Errorf("migrate users: %w", err)
	}

	classes, err := st.migrateGradeLevelsAndClasses(ctx, tenantID, academicYearID, d.classes, report.Table("classes"), report.Table("grade_levels"))
	if err != nil {
		return fmt.Errorf("migrate classes: %w", err)
	}

	subjects, err := st.migrateSubjects(ctx, tenantID, d.subjects, report.Table("subjects"))
	if err != nil {
		return fmt.Errorf("migrate subjects: %w", err)
	}

	academicYearStartsOn, err := st.academicYearStartsOn(ctx, academicYearID)
	if err != nil {
		return fmt.Errorf("look up academic year start date: %w", err)
	}
	if err := st.migrateEnrollments(ctx, tenantID, academicYearID, academicYearStartsOn, d.enrollments, users, classes, report.Table("enrollments")); err != nil {
		return fmt.Errorf("migrate enrollments: %w", err)
	}

	if err := st.migrateTeachingAssignments(ctx, tenantID, academicYearID, d.teachingAssignments, users, classes, subjects, report.Table("teaching_assignments")); err != nil {
		return fmt.Errorf("migrate teaching assignments: %w", err)
	}

	allDuties := append(append([]SionDutyAssignment{}, d.teacherDuties...), d.employeeDuties...)
	if err := st.migrateDutyAssignments(ctx, tenantID, academicYearID, academicYearStartsOn, allDuties, users, classes, dutyIDs, report.Table("duty_assignments")); err != nil {
		return fmt.Errorf("migrate duty assignments: %w", err)
	}

	_, periods, err := st.migratePeriods(ctx, tenantID, cfg.SourceYear, d.periods, report.Table("periods"))
	if err != nil {
		return fmt.Errorf("migrate periods: %w", err)
	}

	schedules, err := st.migrateSchedules(ctx, tenantID, academicYearID, d.schedules, users, classes, subjects, periods, report.Table("schedules"))
	if err != nil {
		return fmt.Errorf("migrate schedules: %w", err)
	}

	lookups := attendanceLookups{users: users, classes: classes, subjects: subjects, periods: periods, schedules: schedules}
	st.migrateAttendance(ctx, tenantID, d.sessions, d.entries, lookups,
		report.Table("attendance_sessions"), report.Table("attendance_entries"))

	violationTypes := st.migrateViolationTypes(ctx, tenantID, d.violationTypes, report.Table("violation_types"))
	st.migrateViolationRecords(ctx, tenantID, academicYearID, d.violationRecords, users, violationTypes, report.Table("violation_records"))
	st.migrateWarningLetters(ctx, tenantID, academicYearID, d.warningLetters, users, report.Table("warning_letters"))

	st.migratePermits(ctx, tenantID, academicYearID, source, sionYearID, d.leaveRequests, users, classes, report.Table("leave_requests"))

	return nil
}
