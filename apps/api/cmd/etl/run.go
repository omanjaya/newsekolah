package main

import (
	"context"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"time"

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

	startYear, endYear, err := parseSourceYear(cfg.SourceYear)
	if err != nil {
		return nil, err
	}
	semester, err := parseSourceSemester(cfg.SourceSemester)
	if err != nil {
		return nil, err
	}

	sourceYearID, err := source.resolveYearID(startYear, endYear, semester)
	if err != nil {
		return nil, err
	}
	yearStartDate, yearEndDate, err := source.FetchYearDates(sourceYearID)
	if err != nil {
		return nil, fmt.Errorf("fetch source year dates: %w", err)
	}

	scheduleVersion, err := source.resolveScheduleVersion(sourceYearID)
	if err != nil {
		return nil, err
	}
	logger.Info("resolved schedule version for migrated year",
		"id", scheduleVersion.ID, "name", scheduleVersion.Name, "status", scheduleVersion.Status)

	data, err := fetchAll(source, sourceYearID, scheduleVersion.ID)
	if err != nil {
		return nil, err
	}

	report := NewReport(clk, cfg.TenantSlug, fmt.Sprintf("%s %s", cfg.SourceYear, cfg.SourceSemester), cfg.DryRun)

	err = runInTransaction(ctx, pool, tenantID, cfg.DryRun, func(st *Store) error {
		return runMigrationSteps(ctx, st, tenantID, cfg, source, sourceYearID, semester, yearStartDate, yearEndDate, scheduleVersion, data, report)
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

// parseSourceYear splits the operator-facing "YYYY/YYYY" --source-year flag
// into its two years, validating they are consecutive -- the same contract
// the flag has always had, now enforced here instead of inside the source
// query itself.
func parseSourceYear(label string) (start, end int, err error) {
	parts := strings.Split(label, "/")
	if len(parts) != 2 {
		return 0, 0, fmt.Errorf("source year %q is not in YYYY/YYYY form", label)
	}
	start, startErr := strconv.Atoi(parts[0])
	end, endErr := strconv.Atoi(parts[1])
	if startErr != nil || endErr != nil {
		return 0, 0, fmt.Errorf("source year %q is not in YYYY/YYYY form", label)
	}
	if end != start+1 {
		return 0, 0, fmt.Errorf("source year %q does not span consecutive years", label)
	}
	return start, end, nil
}

// parseSourceSemester translates the operator-facing --source-semester flag
// into the live schema's years.semester integer (1 = ganjil, 2 = genap).
// config.go already validates the flag is one of these two values, so the
// default branch here is unreachable in practice; it exists for the same
// fail-fast defensiveness the rest of this command follows.
func parseSourceSemester(semester string) (int, error) {
	switch semester {
	case "ganjil":
		return 1, nil
	case "genap":
		return 2, nil
	default:
		return 0, fmt.Errorf("source semester %q must be ganjil or genap", semester)
	}
}

// sourceData holds every row fetched from the live source for the selected
// year and schedule version, read once up front so the transactional
// migration steps never touch the MySQL connection (keeping the target
// transaction's lifetime short and making a dry run's cost predictable).
type sourceData struct {
	users               []SionUser
	userRoles           map[int64][]string
	managementStaff     map[int64]string
	classes             []SionClass
	subjects            []SionSubject
	rooms               []SionRoom
	enrollments         []SionEnrollment
	teachingAssignments []SionTeachingAssignment
	classAdministrators []SionClassAdministrator
	periods             []SionPeriod
	schedules           []SionSchedule
}

func fetchAll(source *Source, sourceYearID, scheduleVersionID int64) (sourceData, error) {
	var d sourceData
	var err error
	steps := []struct {
		name string
		fn   func() error
	}{
		{"users", func() (e error) { d.users, e = source.FetchUsers(); return }},
		{"user roles", func() (e error) { d.userRoles, e = source.FetchUserRoles(); return }},
		{"management staff", func() (e error) { d.managementStaff, e = source.FetchManagementStaff(); return }},
		{"classes", func() (e error) { d.classes, e = source.FetchClasses(sourceYearID); return }},
		{"subjects", func() (e error) { d.subjects, e = source.FetchSubjects(); return }},
		{"rooms", func() (e error) { d.rooms, e = source.FetchRooms(); return }},
		{"enrollments", func() (e error) { d.enrollments, e = source.FetchEnrollments(sourceYearID); return }},
		{"teaching assignments", func() (e error) {
			d.teachingAssignments, e = source.FetchTeachingAssignments(scheduleVersionID)
			return
		}},
		{"class administrators", func() (e error) { d.classAdministrators, e = source.FetchClassAdministrators(sourceYearID); return }},
		{"periods", func() (e error) { d.periods, e = source.FetchPeriods(); return }},
		{"schedules", func() (e error) { d.schedules, e = source.FetchSchedules(scheduleVersionID); return }},
	}
	for _, step := range steps {
		if err = step.fn(); err != nil {
			return sourceData{}, fmt.Errorf("fetch %s: %w", step.name, err)
		}
	}
	return d, nil
}

// runMigrationSteps runs every migration step against the already-open
// transaction, in the dependency order docs/13-etl-sion.md documents:
// academic year, term, roles/duties, users, grade levels/classes, rooms,
// subjects, enrollments, teaching assignments, duty assignments, periods,
// schedules.
func runMigrationSteps(
	ctx context.Context, st *Store, tenantID uuid.UUID, cfg Config, source *Source,
	sourceYearID int64, semester int, yearStartDate, yearEndDate time.Time, scheduleVersion SionScheduleVersion,
	d sourceData, report *Report,
) error {
	yearStat := report.Table("academic_years")
	yearStat.Read++
	academicYearID, yearCreated, err := st.ensureAcademicYear(ctx, tenantID, cfg.SourceYear, yearStartDate, yearEndDate)
	if err != nil {
		yearStat.RecordFailure(cfg.SourceYear, err.Error())
		return fmt.Errorf("ensure academic year: %w", err)
	}
	if yearCreated {
		yearStat.Created++
	} else {
		yearStat.Skipped++
	}

	termStat := report.Table("terms")
	termStat.Read++
	termID, termCreated, err := st.ensureTerm(ctx, tenantID, academicYearID, semester, yearStartDate, yearEndDate)
	if err != nil {
		termStat.RecordFailure(cfg.SourceYear, err.Error())
		return fmt.Errorf("ensure term: %w", err)
	}
	if termCreated {
		termStat.Created++
	} else {
		termStat.Skipped++
	}

	roleIDs, dutyIDs, err := st.ensureRolesAndDuties(ctx, tenantID)
	if err != nil {
		return fmt.Errorf("ensure roles and duties: %w", err)
	}

	users, err := st.migrateUsers(ctx, tenantID, roleIDs, d.users, d.userRoles, d.managementStaff, report.Table("users"))
	if err != nil {
		return fmt.Errorf("migrate users: %w", err)
	}

	classes, err := st.migrateGradeLevelsAndClasses(ctx, tenantID, academicYearID, d.classes, report.Table("classes"), report.Table("grade_levels"))
	if err != nil {
		return fmt.Errorf("migrate classes: %w", err)
	}

	if _, err := st.migrateRooms(ctx, tenantID, d.rooms, report.Table("rooms")); err != nil {
		return fmt.Errorf("migrate rooms: %w", err)
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

	teachingAssignmentStat := report.Table("teaching_assignments")
	if _, err := st.migrateTeachingAssignments(ctx, tenantID, academicYearID, d.teachingAssignments, users, classes, subjects, teachingAssignmentStat); err != nil {
		return fmt.Errorf("migrate teaching assignments: %w", err)
	}
	teachingAssignmentStat.RecordGap(fmt.Sprintf(
		"schedule_version used for this run: id=%d name=%q status=%q (selection rule in docs/13-etl-sion.md)",
		scheduleVersion.ID, scheduleVersion.Name, scheduleVersion.Status,
	))

	dutyStat := report.Table("duty_assignments")
	if err := st.migrateDutyAssignments(ctx, tenantID, academicYearID, academicYearStartsOn, d.classAdministrators, d.userRoles, d.managementStaff, users, classes, dutyIDs, dutyStat); err != nil {
		return fmt.Errorf("migrate duty assignments: %w", err)
	}
	recordDutyGaps(source, sourceYearID, dutyStat)

	_, periods, err := st.migratePeriods(ctx, tenantID, cfg.SourceYear, d.periods, report.Table("periods"))
	if err != nil {
		return fmt.Errorf("migrate periods: %w", err)
	}

	taIndex := IndexTeachingAssignmentsByID(d.teachingAssignments)
	if _, err := st.migrateSchedules(ctx, tenantID, academicYearID, termID, d.schedules, taIndex, users, classes, subjects, periods, report.Table("schedules")); err != nil {
		return fmt.Errorf("migrate schedules: %w", err)
	}

	return nil
}
