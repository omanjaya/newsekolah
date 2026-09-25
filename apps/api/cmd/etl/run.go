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

	"github.com/omanjaya/newsekolah/apps/api/cmd/etl/mapping"
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

	scheduleVersions, err := source.FetchScheduleVersions(sourceYearID)
	if err != nil {
		return nil, err
	}
	scheduleVersionIDs := make([]int64, len(scheduleVersions))
	for i, v := range scheduleVersions {
		scheduleVersionIDs[i] = v.ID
	}
	primaryScheduleVersion := pickPrimaryScheduleVersion(scheduleVersions)
	logger.Info("resolved schedule versions for migrated year",
		"versions", scheduleVersionIDs, "primary_for_journals", primaryScheduleVersion.ID)

	tenantLocation, err := loadTenantLocation(ctx, pool, tenantID)
	if err != nil {
		return nil, err
	}

	data, err := fetchAll(source, sourceYearID, scheduleVersionIDs, primaryScheduleVersion.ID, yearStartDate, yearEndDate)
	if err != nil {
		return nil, err
	}

	report := NewReport(clk, cfg.TenantSlug, fmt.Sprintf("%s %s", cfg.SourceYear, cfg.SourceSemester), cfg.DryRun)

	err = runInTransaction(ctx, pool, tenantID, cfg.DryRun, func(st *Store) error {
		return runMigrationSteps(ctx, st, tenantID, cfg, source, sourceYearID, semester, yearStartDate, yearEndDate, scheduleVersions, tenantLocation, data, report)
	})
	if err != nil {
		return nil, fmt.Errorf("migration transaction: %w", err)
	}

	report.Finish()
	logger.Info("etl migration finished", "tenant", cfg.TenantSlug, "dry_run", cfg.DryRun)
	return report, nil
}

// loadTenantLocation reads the target tenant's configured IANA timezone
// (tenants.timezone, default 'Asia/Makassar') so mapping.LocalToUTC can
// reinterpret a naive timestamp read from the source (see source.go's
// parseTime=true&loc=UTC doc comment) as tenant wall-clock time instead of
// leaving it mislabelled UTC.
func loadTenantLocation(ctx context.Context, pool *pgxpool.Pool, tenantID uuid.UUID) (*time.Location, error) {
	var tz string
	if err := pool.QueryRow(ctx, `select timezone from tenants where id = $1`, tenantID).Scan(&tz); err != nil {
		return nil, fmt.Errorf("load tenant timezone: %w", err)
	}
	loc, err := time.LoadLocation(tz)
	if err != nil {
		return nil, fmt.Errorf("tenant timezone %q: %w", tz, err)
	}
	return loc, nil
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
	users                   []SionUser
	userRoles               map[int64][]string
	managementStaff         map[int64]string
	orphanedRoleAssignments int
	classes                 []SionClass
	subjects                []SionSubject
	rooms                   []SionRoom
	enrollments             []SionEnrollment
	teachingAssignments     []SionTeachingAssignment
	classAdministrators     []SionClassAdministrator
	classOfBKCount          int
	bkOnDutyCount           int
	periods                 []SionPeriod
	schedules               []SionSchedule

	attendanceSessions []SionAttendanceSession
	attendanceEntries  map[int64][]SionAttendanceEntry

	journals []SionJournal

	violationTypes   []SionViolationType
	violationRecords []SionViolationRecord
	suspensionCount  int

	exitPermits           []SionExitPermit
	exitPermitsNotFinal   int
	exitPermitsLateType   int
	leaveRequests         []SionLeaveRequest
	leaveRequestsNotFinal int

	learningObjectives map[int64]SionLearningObjective
	grades             []SionGrade
	reportScores       []SionReportScore
	previousGrades     []SionPreviousGrade
	gradePublications  []SionGradePublication
	starAwards         []SionStarAward

	books           []SionBook
	bookLoanCodes   map[int64][]string
	bookLoans       []SionBookLoan
	libraryVisits   []SionLibraryVisit
	librarySettings []LibrarySetting
}

func fetchAll(source *Source, sourceYearID int64, scheduleVersionIDs []int64, primaryScheduleVersionID int64, yearStartDate, yearEndDate time.Time) (sourceData, error) {
	var d sourceData
	var err error
	steps := []struct {
		name string
		fn   func() error
	}{
		{"users", func() (e error) { d.users, e = source.FetchUsers(); return }},
		{"user roles", func() (e error) { d.userRoles, e = source.FetchUserRoles(); return }},
		{"management staff", func() (e error) { d.managementStaff, e = source.FetchManagementStaff(); return }},
		{"orphaned role assignments count", func() (e error) { d.orphanedRoleAssignments, e = source.CountOrphanedRoleAssignments(); return }},
		{"classes", func() (e error) { d.classes, e = source.FetchClasses(sourceYearID); return }},
		{"subjects", func() (e error) { d.subjects, e = source.FetchSubjects(); return }},
		{"rooms", func() (e error) { d.rooms, e = source.FetchRooms(); return }},
		{"enrollments", func() (e error) { d.enrollments, e = source.FetchEnrollments(sourceYearID); return }},
		{"teaching assignments", func() (e error) {
			d.teachingAssignments, e = source.FetchTeachingAssignments(scheduleVersionIDs)
			return
		}},
		{"class administrators", func() (e error) { d.classAdministrators, e = source.FetchClassAdministrators(sourceYearID); return }},
		{"class of bks count", func() (e error) { d.classOfBKCount, e = source.CountClassOfBKAssignments(sourceYearID); return }},
		{"bk on duty count", func() (e error) { d.bkOnDutyCount, e = source.CountBKOnDutyRecords(); return }},
		{"periods", func() (e error) { d.periods, e = source.FetchPeriods(); return }},
		{"schedules", func() (e error) { d.schedules, e = source.FetchSchedules(scheduleVersionIDs); return }},

		{"attendance sessions", func() (e error) { d.attendanceSessions, e = source.FetchAttendanceSessions(sourceYearID); return }},
		{"attendance entries", func() (e error) { d.attendanceEntries, e = source.FetchAttendanceEntries(sourceYearID); return }},

		{"journals", func() (e error) { d.journals, e = source.FetchJournals(primaryScheduleVersionID); return }},

		{"violation types", func() (e error) { d.violationTypes, e = source.FetchViolationTypes(); return }},
		{"violation records", func() (e error) { d.violationRecords, e = source.FetchViolationRecords(sourceYearID); return }},
		{"suspension count", func() (e error) { d.suspensionCount, e = source.CountSuspensions(sourceYearID); return }},

		{"exit permits", func() (e error) {
			d.exitPermits, e = source.FetchExitPermits(sourceYearID, yearStartDate, yearEndDate)
			return
		}},
		{"exit permits not-final count", func() (e error) {
			d.exitPermitsNotFinal, d.exitPermitsLateType, e = source.CountExitPermitsNotFinal(sourceYearID, yearStartDate, yearEndDate)
			return
		}},
		{"leave requests", func() (e error) {
			d.leaveRequests, e = source.FetchLeaveRequests(sourceYearID, yearStartDate, yearEndDate)
			return
		}},
		{"leave requests not-final count", func() (e error) {
			d.leaveRequestsNotFinal, e = source.CountLeaveRequestsNotFinal(yearStartDate, yearEndDate)
			return
		}},

		{"learning objectives", func() (e error) { d.learningObjectives, e = source.FetchLearningObjectives(sourceYearID); return }},
		{"grades", func() (e error) { d.grades, e = source.FetchGrades(sourceYearID); return }},
		{"report scores", func() (e error) { d.reportScores, e = source.FetchReportScores(sourceYearID); return }},
		{"previous grades", func() (e error) { d.previousGrades, e = source.FetchPreviousGrades(sourceYearID); return }},
		{"grade publications", func() (e error) { d.gradePublications, e = source.FetchGradePublications(sourceYearID); return }},
		{"classroom star awards", func() (e error) { d.starAwards, e = source.FetchClassroomStarAwards(sourceYearID); return }},

		{"books", func() (e error) { d.books, e = source.FetchBooks(); return }},
		{"book loan codes", func() (e error) { d.bookLoanCodes, e = source.FetchBookLoanCodesByBook(); return }},
		{"book loans", func() (e error) { d.bookLoans, e = source.FetchBookLoans(); return }},
		{"library visits", func() (e error) { d.libraryVisits, e = source.FetchLibraryVisits(); return }},
		{"library settings", func() (e error) { d.librarySettings, e = source.FetchLibrarySettings(); return }},
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
// mappings from the legacy MySQL schema to the new Postgres schema; each
// branch handles one nullable source column or one gap case, and is a
// one-time migration tool exercised by its own tests, not runtime API
// logic. Splitting it would only relocate the same linear mapping.
//
//nolint:gocyclo // ETL migration: a fixed, ordered sequence of per-row/per-column field
func runMigrationSteps(
	ctx context.Context, st *Store, tenantID uuid.UUID, cfg Config, _ *Source,
	_ int64, semester int, yearStartDate, yearEndDate time.Time, scheduleVersions []SionScheduleVersion,
	tenantLocation *time.Location, d sourceData, report *Report,
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
		"schedule_versions unioned into this run's timetable, newest effective_from winning per class/weekday/period slot (not status, see docs/13-etl-sion.md \"Union jadwal\"): %s",
		summarizeScheduleVersions(scheduleVersions),
	))

	dutyStat := report.Table("duty_assignments")
	if err := st.migrateDutyAssignments(ctx, tenantID, academicYearID, academicYearStartsOn, d.classAdministrators, d.userRoles, d.managementStaff, users, classes, dutyIDs, dutyStat); err != nil {
		return fmt.Errorf("migrate duty assignments: %w", err)
	}
	recordDutyGaps(d.classOfBKCount, d.bkOnDutyCount, d.orphanedRoleAssignments, dutyStat)

	_, periods, err := st.migratePeriods(ctx, tenantID, cfg.SourceYear, d.periods, report.Table("periods"))
	if err != nil {
		return fmt.Errorf("migrate periods: %w", err)
	}

	taIndex := IndexTeachingAssignmentsByID(d.teachingAssignments)
	unionSchedules, winningScheduleIDBySlot := buildScheduleUnion(d.schedules, scheduleVersions, taIndex)
	scheduleIDs, err := st.migrateSchedules(ctx, tenantID, academicYearID, termID, unionSchedules, taIndex, users, classes, subjects, periods, report.Table("schedules"))
	if err != nil {
		return fmt.Errorf("migrate schedules: %w", err)
	}

	resolution := buildScheduleResolution(d.schedules, winningScheduleIDBySlot, scheduleIDs)
	attendanceSessions, err := st.migrateAttendanceSessions(
		ctx, tenantID, academicYearID, d.attendanceSessions, resolution, users, classes, subjects, periods, tenantLocation,
		report.Table("attendance_sessions"),
	)
	if err != nil {
		return fmt.Errorf("migrate attendance sessions: %w", err)
	}
	if err := st.migrateAttendanceEntries(ctx, tenantID, d.attendanceEntries, attendanceSessions, users, report.Table("attendance_entries")); err != nil {
		return fmt.Errorf("migrate attendance entries: %w", err)
	}

	if err := st.migrateJournals(ctx, tenantID, academicYearID, d.journals, users, classes, subjects, attendanceSessions, report.Table("class_journals")); err != nil {
		return fmt.Errorf("migrate journals: %w", err)
	}

	violationTypes, err := st.migrateViolationTypes(ctx, tenantID, d.violationTypes, report.Table("violation_types"))
	if err != nil {
		return fmt.Errorf("migrate violation types: %w", err)
	}
	if err := st.migrateViolationRecords(ctx, tenantID, academicYearID, d.violationRecords, users, violationTypes, report.Table("violation_records")); err != nil {
		return fmt.Errorf("migrate violation records: %w", err)
	}
	recordSuspensionGap(d.suspensionCount, report.Table("suspensions"))

	userNames := indexUserNames(d.users)

	exitPermitStat := report.Table("exit_permits")
	if err := st.migrateExitPermits(ctx, tenantID, academicYearID, d.exitPermits, users, userNames, classes, periods, tenantLocation, exitPermitStat); err != nil {
		return fmt.Errorf("migrate exit permits: %w", err)
	}
	if d.exitPermitsNotFinal > 0 {
		exitPermitStat.RecordGap(fmt.Sprintf(
			"student_permits: %d row(s) not migrated -- still mid-flow (status approved/out), %d of those also excluded as permit_type 'late'",
			d.exitPermitsNotFinal, d.exitPermitsLateType,
		))
	}

	leaveRequestStat := report.Table("leave_requests")
	if err := st.migrateLeaveRequests(ctx, tenantID, academicYearID, d.leaveRequests, users, userNames, classes, tenantLocation, leaveRequestStat); err != nil {
		return fmt.Errorf("migrate leave requests: %w", err)
	}
	if d.leaveRequestsNotFinal > 0 {
		leaveRequestStat.RecordGap(fmt.Sprintf("permits: %d row(s) not migrated -- still mid-flow (awaiting homeroom teacher's or counselor's decision)", d.leaveRequestsNotFinal))
	}

	componentStat := report.Table("assessment_components")
	components, err := st.migrateAssessmentComponents(ctx, tenantID, academicYearID, termID, d.grades, d.learningObjectives, users, classes, subjects, componentStat)
	if err != nil {
		return fmt.Errorf("migrate assessment components: %w", err)
	}
	if err := st.migrateGrades(ctx, tenantID, d.grades, components, d.learningObjectives, users, report.Table("grades")); err != nil {
		return fmt.Errorf("migrate grades: %w", err)
	}

	previousGrades := indexPreviousGrades(d.previousGrades)
	if err := st.migrateReportScores(ctx, tenantID, academicYearID, termID, d.reportScores, previousGrades, users, classes, subjects, report.Table("report_scores")); err != nil {
		return fmt.Errorf("migrate report scores: %w", err)
	}
	if err := st.migrateGradePublications(ctx, tenantID, academicYearID, termID, d.gradePublications, users, classes, subjects, report.Table("grade_publications")); err != nil {
		return fmt.Errorf("migrate grade publications: %w", err)
	}
	if err := st.migrateStarAwards(ctx, tenantID, academicYearID, d.starAwards, users, classes, subjects, report.Table("star_events")); err != nil {
		return fmt.Errorf("migrate star awards: %w", err)
	}

	libraryTitles, err := st.migrateLibraryTitles(ctx, tenantID, d.books, report.Table("library_titles"))
	if err != nil {
		return fmt.Errorf("migrate library titles: %w", err)
	}
	libraryCopies, err := st.migrateLibraryCopies(ctx, tenantID, d.books, libraryTitles, d.bookLoanCodes, report.Table("library_copies"))
	if err != nil {
		return fmt.Errorf("migrate library copies: %w", err)
	}
	if err := st.migrateBookLoans(ctx, tenantID, d.bookLoans, libraryTitles, libraryCopies, users, tenantLocation, report.Table("library_loans")); err != nil {
		return fmt.Errorf("migrate book loans: %w", err)
	}
	if err := st.migrateLibraryVisits(ctx, tenantID, d.libraryVisits, users, tenantLocation, report.Table("library_visits")); err != nil {
		return fmt.Errorf("migrate library visits: %w", err)
	}
	recordLibrarySettingsGap(d.librarySettings, report.Table("library_settings"))

	return nil
}

// summarizeScheduleVersions renders every schedule_versions row fetched for
// this run's year into one line for the teaching_assignments report gap, so
// an operator can see exactly which revisions were unioned, and in what
// order, without opening the source database.
func summarizeScheduleVersions(versions []SionScheduleVersion) string {
	parts := make([]string, len(versions))
	for i, v := range versions {
		effective := "none"
		if v.EffectiveFrom.Valid {
			effective = v.EffectiveFrom.Time.Format("2006-01-02")
		}
		parts[i] = fmt.Sprintf("id=%d name=%q status=%q effective_from=%s", v.ID, v.Name, v.Status, effective)
	}
	return strings.Join(parts, "; ")
}

// indexUserNames builds a source user id -> cleaned display name lookup,
// for report snapshot columns (e.g. exit_permits.student_name_snapshot)
// that need a name rather than a foreign key.
func indexUserNames(users []SionUser) map[int64]string {
	out := make(map[int64]string, len(users))
	for _, u := range users {
		out[u.ID] = mapping.CleanName(u.Name)
	}
	return out
}
