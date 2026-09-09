package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic"
	academicdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
	academicservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling"
	schedulingdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
	schedulingservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/events"
)

const (
	periodTemplateName = "Reguler"
	demoClassName      = "X-A"
	demoSubjectCode    = "MAT"
	schoolDaysPerWeek  = 5
)

type periodSeed struct {
	name       string
	start, end academicdomain.ClockTime
	isBreak    bool
}

// A conventional Indonesian senior-high day: eight 45-minute periods with
// two breaks. Attendance sessions and late-arrival cut-offs derive from
// these, so keep the first period early.
var regularPeriods = []periodSeed{
	{"Jam 1", academicdomain.ClockTime{Hour: 7, Minute: 0}, academicdomain.ClockTime{Hour: 7, Minute: 45}, false},
	{"Jam 2", academicdomain.ClockTime{Hour: 7, Minute: 45}, academicdomain.ClockTime{Hour: 8, Minute: 30}, false},
	{"Jam 3", academicdomain.ClockTime{Hour: 8, Minute: 30}, academicdomain.ClockTime{Hour: 9, Minute: 15}, false},
	{"Istirahat 1", academicdomain.ClockTime{Hour: 9, Minute: 15}, academicdomain.ClockTime{Hour: 9, Minute: 30}, true},
	{"Jam 4", academicdomain.ClockTime{Hour: 9, Minute: 30}, academicdomain.ClockTime{Hour: 10, Minute: 15}, false},
	{"Jam 5", academicdomain.ClockTime{Hour: 10, Minute: 15}, academicdomain.ClockTime{Hour: 11, Minute: 0}, false},
	{"Jam 6", academicdomain.ClockTime{Hour: 11, Minute: 0}, academicdomain.ClockTime{Hour: 11, Minute: 45}, false},
	{"Istirahat 2", academicdomain.ClockTime{Hour: 11, Minute: 45}, academicdomain.ClockTime{Hour: 12, Minute: 15}, true},
	{"Jam 7", academicdomain.ClockTime{Hour: 12, Minute: 15}, academicdomain.ClockTime{Hour: 13, Minute: 0}, false},
	{"Jam 8", academicdomain.ClockTime{Hour: 13, Minute: 0}, academicdomain.ClockTime{Hour: 13, Minute: 45}, false},
}

var subjectSeeds = []struct{ code, name string }{
	{"MAT", "Matematika"},
	{"BIN", "Bahasa Indonesia"},
	{"BIG", "Bahasa Inggris"},
	{"FIS", "Fisika"},
	{"BIO", "Biologi"},
	{"SEJ", "Sejarah"},
}

// seedOperations fills in everything a day at school needs: a period
// template on every weekday, subjects, the demo student enrolled in X-A,
// the demo teacher as X-A's homeroom and mathematics teacher, and a
// timetable block on each school day.
func seedOperations(ctx context.Context, pool *pgxpool.Pool, q *db.Queries, tenantID, yearID uuid.UUID, users map[string]db.User, logger *slog.Logger) error {
	teacher, student := users["guru"], users["siswa"]
	academicSvc := academic.Register(pool, clock.Real{}).Service
	schedulingSvc := scheduling.Register(pool, events.NewBus(), nil).Service

	template, err := ensurePeriodTemplate(ctx, academicSvc, tenantID)
	if err != nil {
		return err
	}
	periods, err := ensurePeriods(ctx, academicSvc, tenantID, template.ID)
	if err != nil {
		return err
	}
	if err := ensureWeek(ctx, academicSvc, tenantID, yearID, template.ID); err != nil {
		return err
	}
	subjects, err := ensureSubjects(ctx, academicSvc, tenantID)
	if err != nil {
		return err
	}

	class, err := findClass(ctx, academicSvc, tenantID, yearID, demoClassName)
	if err != nil {
		return err
	}
	if err := ensureEnrollment(ctx, academicSvc, tenantID, yearID, student.ID, class.ID); err != nil {
		return err
	}
	if err := ensureHomeroom(ctx, q, academicSvc, tenantID, yearID, teacher.ID, class); err != nil {
		return err
	}
	if err := ensureDuty(ctx, q, tenantID, yearID, users["gurubk"].ID, "counselor", uuid.NullUUID{}); err != nil {
		return err
	}
	if err := ensureTeaching(ctx, academicSvc, tenantID, yearID, teacher.ID, subjects[demoSubjectCode].ID, class.ID); err != nil {
		return err
	}
	if err := ensureTimetable(ctx, schedulingSvc, tenantID, yearID, teacher.ID, subjects[demoSubjectCode].ID, class.ID, periods); err != nil {
		return err
	}
	logger.Info("operational data ready", "class", class.Name, "teacher", teacher.Username, "student", student.Username)
	return nil
}

func ensurePeriodTemplate(ctx context.Context, svc *academicservice.Service, tenantID uuid.UUID) (academicdomain.PeriodTemplate, error) {
	templates, err := svc.ListPeriodTemplates(ctx, tenantID)
	if err != nil {
		return academicdomain.PeriodTemplate{}, fmt.Errorf("list period templates: %w", err)
	}
	for _, t := range templates {
		if t.Name == periodTemplateName {
			return t, nil
		}
	}
	t, err := svc.CreatePeriodTemplate(ctx, tenantID, periodTemplateName, true)
	if err != nil {
		return academicdomain.PeriodTemplate{}, fmt.Errorf("create period template: %w", err)
	}
	return t, nil
}

func ensurePeriods(ctx context.Context, svc *academicservice.Service, tenantID, templateID uuid.UUID) ([]academicdomain.Period, error) {
	existing, err := svc.ListPeriods(ctx, tenantID, templateID)
	if err != nil {
		return nil, fmt.Errorf("list periods: %w", err)
	}
	if len(existing) > 0 {
		return existing, nil
	}
	out := make([]academicdomain.Period, 0, len(regularPeriods))
	for i, p := range regularPeriods {
		created, err := svc.CreatePeriod(ctx, academicdomain.Period{
			TenantID: tenantID, TemplateID: templateID, Name: p.name,
			Sequence: int16(i + 1), StartsAt: p.start, EndsAt: p.end, IsBreak: p.isBreak, //nolint:gosec // bounded by len(regularPeriods)
		})
		if err != nil {
			return nil, fmt.Errorf("create period %s: %w", p.name, err)
		}
		out = append(out, created)
	}
	return out, nil
}

// ensureWeek marks Monday to Friday as school days on the regular template
// and Saturday/Sunday as off. SetSchoolDay and SetWeekdayAssignment upsert,
// so re-running is harmless.
func ensureWeek(ctx context.Context, svc *academicservice.Service, tenantID, yearID, templateID uuid.UUID) error {
	for dow := int16(1); dow <= 7; dow++ {
		active := dow <= schoolDaysPerWeek
		if err := svc.SetSchoolDay(ctx, tenantID, yearID, dow, active); err != nil {
			return fmt.Errorf("set school day %d: %w", dow, err)
		}
		if !active {
			continue
		}
		if err := svc.SetWeekdayAssignment(ctx, tenantID, yearID, templateID, dow); err != nil {
			return fmt.Errorf("assign template to weekday %d: %w", dow, err)
		}
	}
	return nil
}

func ensureSubjects(ctx context.Context, svc *academicservice.Service, tenantID uuid.UUID) (map[string]academicdomain.Subject, error) {
	existing, _, err := svc.ListSubjects(ctx, tenantID, "", academicservice.Page{Limit: 200})
	if err != nil {
		return nil, fmt.Errorf("list subjects: %w", err)
	}
	byCode := make(map[string]academicdomain.Subject, len(subjectSeeds))
	for _, s := range existing {
		byCode[s.Code] = s
	}
	for _, seed := range subjectSeeds {
		if _, ok := byCode[seed.code]; ok {
			continue
		}
		s, err := svc.CreateSubject(ctx, tenantID, seed.code, seed.name)
		if err != nil {
			return nil, fmt.Errorf("create subject %s: %w", seed.code, err)
		}
		byCode[seed.code] = s
	}
	return byCode, nil
}

func findClass(ctx context.Context, svc *academicservice.Service, tenantID, yearID uuid.UUID, name string) (academicdomain.Class, error) {
	classes, _, err := svc.ListClasses(ctx, tenantID, yearID, name, nil, academicservice.Page{Limit: 50})
	if err != nil {
		return academicdomain.Class{}, fmt.Errorf("list classes: %w", err)
	}
	for _, c := range classes {
		if c.Name == name {
			return c, nil
		}
	}
	return academicdomain.Class{}, fmt.Errorf("class %s not found after seeding", name)
}

func ensureEnrollment(ctx context.Context, svc *academicservice.Service, tenantID, yearID, studentID, classID uuid.UUID) error {
	_, err := svc.AssignStudent(ctx, tenantID, yearID, studentID, classID, time.Date(2026, 7, 13, 0, 0, 0, 0, time.UTC))
	if err != nil && !errors.Is(err, academicdomain.ErrEnrollmentExists) {
		return fmt.Errorf("enroll student: %w", err)
	}
	return nil
}

// ensureHomeroom records the teacher as homeroom of the class both on the
// class row (what the UI shows) and as a duty assignment (what authz and
// the permits workflow consult).
func ensureHomeroom(ctx context.Context, q *db.Queries, svc *academicservice.Service, tenantID, yearID, teacherID uuid.UUID, class academicdomain.Class) error {
	if class.HomeroomTeacherID == nil || *class.HomeroomTeacherID != teacherID {
		class.HomeroomTeacherID = &teacherID
		if _, err := svc.UpdateClass(ctx, class); err != nil {
			return fmt.Errorf("set homeroom teacher on %s: %w", class.Name, err)
		}
	}

	return ensureDuty(ctx, q, tenantID, yearID, teacherID, "homeroom", uuid.NullUUID{UUID: class.ID, Valid: true})
}

// ensureDuty assigns a duty (optionally scoped to a class) unless the user
// already holds it for this academic year.
func ensureDuty(ctx context.Context, q *db.Queries, tenantID, yearID, userID uuid.UUID, slug string, classID uuid.NullUUID) error {
	duties, err := q.ListActiveDutyAssignmentsForUser(ctx, db.ListActiveDutyAssignmentsForUserParams{TenantID: tenantID, UserID: userID, AcademicYearID: yearID})
	if err != nil {
		return fmt.Errorf("list duties: %w", err)
	}
	for _, d := range duties {
		if d.Slug != slug {
			continue
		}
		if !classID.Valid || (d.ScopeClassID.Valid && d.ScopeClassID.Bytes == classID.UUID) {
			return nil
		}
	}
	dutyType, err := q.GetDutyTypeBySlug(ctx, db.GetDutyTypeBySlugParams{TenantID: tenantID, Slug: slug})
	if err != nil {
		return fmt.Errorf("lookup duty type %s: %w", slug, err)
	}
	scope := pgtype.UUID{}
	if classID.Valid {
		scope = pgtype.UUID{Bytes: classID.UUID, Valid: true}
	}
	if _, err := q.CreateDutyAssignment(ctx, db.CreateDutyAssignmentParams{
		TenantID: tenantID, AcademicYearID: yearID, DutyTypeID: dutyType.ID, UserID: userID,
		ScopeClassID: scope,
		StartsOn:     database.Date(time.Date(2026, 7, 13, 0, 0, 0, 0, time.UTC)),
	}); err != nil {
		return fmt.Errorf("create %s duty: %w", slug, err)
	}
	return nil
}

func ensureTeaching(ctx context.Context, svc *academicservice.Service, tenantID, yearID, teacherID, subjectID, classID uuid.UUID) error {
	_, err := svc.CreateTeachingAssignment(ctx, academicdomain.TeachingAssignment{
		TenantID: tenantID, AcademicYearID: yearID, TeacherUserID: teacherID, SubjectID: subjectID, ClassID: classID, IsActive: true,
	})
	if err != nil && !errors.Is(err, academicdomain.ErrTeachingAssignmentExists) {
		return fmt.Errorf("create teaching assignment: %w", err)
	}
	return nil
}

// ensureTimetable gives the teacher a two-period mathematics block in X-A
// on every school day so "today's schedule" is never empty in the demo.
func ensureTimetable(ctx context.Context, svc *schedulingservice.Service, tenantID, yearID, teacherID, subjectID, classID uuid.UUID, periods []academicdomain.Period) error {
	existing, err := svc.ListByTeacher(ctx, tenantID, yearID, teacherID)
	if err != nil {
		return fmt.Errorf("list schedules: %w", err)
	}
	if len(existing) > 0 {
		return nil
	}
	lessons := make([]academicdomain.Period, 0, 2)
	for _, p := range periods {
		if !p.IsBreak {
			lessons = append(lessons, p)
		}
		if len(lessons) == 2 {
			break
		}
	}
	if len(lessons) < 2 {
		return fmt.Errorf("need at least two lesson periods, have %d", len(lessons))
	}
	actor := schedulingservice.Actor{UserID: teacherID, CanManage: true}
	for dow := int16(1); dow <= schoolDaysPerWeek; dow++ {
		_, err := svc.CreateSchedule(ctx, tenantID, schedulingservice.ScheduleInput{
			AcademicYearID: yearID, ClassID: classID, SubjectID: subjectID, TeacherUserID: teacherID,
			DayOfWeek: dow, StartPeriodID: lessons[0].ID, EndPeriodID: lessons[1].ID, Source: schedulingdomain.SourceAdmin,
		}, actor)
		if err != nil {
			return fmt.Errorf("create schedule for weekday %d: %w", dow, err)
		}
	}
	return nil
}
