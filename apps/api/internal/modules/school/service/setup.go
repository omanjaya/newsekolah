package service

import (
	"context"
	"strings"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school/domain"
)

// SetupStepKey names one step of the onboarding checklist
// (docs/11-feature-recommendations.md item 1). The UI turns these into
// labels and links; the server only reports what exists.
type SetupStepKey string

const (
	StepProfile             SetupStepKey = "profile"
	StepAcademicYear        SetupStepKey = "academic_year"
	StepGradeLevels         SetupStepKey = "grade_levels"
	StepClasses             SetupStepKey = "classes"
	StepPeriods             SetupStepKey = "periods"
	StepSubjects            SetupStepKey = "subjects"
	StepTeachers            SetupStepKey = "teachers"
	StepStudents            SetupStepKey = "students"
	StepEnrollments         SetupStepKey = "enrollments"
	StepTeachingAssignments SetupStepKey = "teaching_assignments"
	StepSchedules           SetupStepKey = "schedules"
	StepDuties              SetupStepKey = "duties"
)

// SetupStep is one checklist row: done or not, with the count behind it so
// the UI can say "24 siswa" rather than only a tick.
type SetupStep struct {
	Key      SetupStepKey
	Done     bool
	Count    int
	Required bool
}

// SetupChecklist is the whole onboarding state.
type SetupChecklist struct {
	Steps           []SetupStep
	RequiredDone    int
	RequiredTotal   int
	ReadyToOperate  bool
	ActiveYearLabel string
}

// SetupCounts is what the repository reports.
type SetupCounts struct {
	AcademicYears, Terms, GradeLevels, Classes, Subjects int
	PeriodTemplates, Periods, SchoolDays                 int
	Teachers, Students, Enrollments                      int
	TeachingAssignments, Schedules, DutyAssignments      int
}

// SetupReader is the repository slice the checklist needs.
type SetupReader interface {
	SetupCounts(ctx context.Context, tenantID uuid.UUID, yearID uuid.NullUUID) (SetupCounts, error)
	UpdateTenantProfile(ctx context.Context, tenantID uuid.UUID, name, educationLevel, timezone, locale string) error
}

// Setup reports how far this school is from being usable. A school is
// "ready to operate" once every required step is done: profile, an active
// year, classes, periods with school days, subjects, teachers, students
// enrolled, and a timetable.
func (s *Service) Setup(ctx context.Context, tenantID uuid.UUID) (SetupChecklist, error) {
	var out SetupChecklist
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		tenant, err := s.repo.GetTenantByID(ctx, tenantID)
		if err != nil {
			return err
		}
		yearID := uuid.NullUUID{}
		if year, ok, err := s.repo.GetActiveAcademicYear(ctx, tenantID); err != nil {
			return err
		} else if ok {
			yearID = uuid.NullUUID{UUID: year.ID, Valid: true}
			out.ActiveYearLabel = year.Label
		}
		counts, err := s.repo.SetupCounts(ctx, tenantID, yearID)
		if err != nil {
			return err
		}
		profileDone := strings.TrimSpace(tenant.Name) != "" && tenant.EducationLevel != "" && tenant.EducationLevel != "other"
		out.Steps = []SetupStep{
			{StepProfile, profileDone, 0, true},
			{StepAcademicYear, yearID.Valid, counts.AcademicYears, true},
			{StepGradeLevels, counts.GradeLevels > 0, counts.GradeLevels, true},
			{StepClasses, counts.Classes > 0, counts.Classes, true},
			{StepPeriods, counts.Periods > 0 && counts.SchoolDays > 0, counts.Periods, true},
			{StepSubjects, counts.Subjects > 0, counts.Subjects, true},
			{StepTeachers, counts.Teachers > 0, counts.Teachers, true},
			{StepStudents, counts.Students > 0, counts.Students, true},
			{StepEnrollments, counts.Enrollments > 0, counts.Enrollments, true},
			{StepTeachingAssignments, counts.TeachingAssignments > 0, counts.TeachingAssignments, false},
			{StepSchedules, counts.Schedules > 0, counts.Schedules, true},
			{StepDuties, counts.DutyAssignments > 0, counts.DutyAssignments, false},
		}
		for _, step := range out.Steps {
			if !step.Required {
				continue
			}
			out.RequiredTotal++
			if step.Done {
				out.RequiredDone++
			}
		}
		out.ReadyToOperate = out.RequiredDone == out.RequiredTotal
		return nil
	})
	return out, err
}

// ProfileInput is the school's identity, edited in the first wizard step.
type ProfileInput struct {
	Name           string
	EducationLevel string
	Timezone       string
	Locale         string
}

func (s *Service) UpdateProfile(ctx context.Context, tenantID uuid.UUID, in ProfileInput) error {
	name := strings.TrimSpace(in.Name)
	if name == "" || in.EducationLevel == "" || in.Timezone == "" {
		return domain.ErrInvalidProfile
	}
	if in.Locale != "id" && in.Locale != "en" {
		return domain.ErrInvalidProfile
	}
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.UpdateTenantProfile(ctx, tenantID, name, in.EducationLevel, in.Timezone, in.Locale)
	})
}
