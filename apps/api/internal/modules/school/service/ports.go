package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	academicdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
	academicservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/service"
	identityservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
)

// AcademicPort is the slice of the academic module's service the
// onboarding wizard needs: applying a level template creates grade
// levels, subjects, and a bell schedule; the Dapodik import matches and
// creates classes and enrollments. It is satisfied directly by
// *academic/service.Service -- cmd/api wires the concrete value in after
// both modules exist (school is constructed first, since academic and
// identity both depend on it for the active academic year).
type AcademicPort interface {
	ApplyGradeLevelTemplate(ctx context.Context, tenantID uuid.UUID, template string) ([]academicdomain.GradeLevel, error)
	ListGradeLevels(ctx context.Context, tenantID uuid.UUID) ([]academicdomain.GradeLevel, error)

	ListSubjects(ctx context.Context, tenantID uuid.UUID, search string, page academicservice.Page) ([]academicdomain.Subject, int64, error)
	CreateSubject(ctx context.Context, tenantID uuid.UUID, code, name string) (academicdomain.Subject, error)

	ListPeriodTemplates(ctx context.Context, tenantID uuid.UUID) ([]academicdomain.PeriodTemplate, error)
	CreatePeriodTemplate(ctx context.Context, tenantID uuid.UUID, name string, isDefault bool) (academicdomain.PeriodTemplate, error)
	ListPeriods(ctx context.Context, tenantID, templateID uuid.UUID) ([]academicdomain.Period, error)
	CreatePeriod(ctx context.Context, p academicdomain.Period) (academicdomain.Period, error)

	ListClasses(ctx context.Context, tenantID, yearID uuid.UUID, search string, gradeLevelID *uuid.UUID, page academicservice.Page) ([]academicdomain.Class, int64, error)
	CreateClass(ctx context.Context, c academicdomain.Class) (academicdomain.Class, error)
	AssignStudent(ctx context.Context, tenantID, yearID, studentID, classID uuid.UUID, joinedOn time.Time) (academicdomain.Enrollment, error)
	MoveStudent(ctx context.Context, tenantID, yearID, studentID, toClassID uuid.UUID, effectiveOn time.Time) (academicdomain.Enrollment, error)
}

// IdentityPort is the slice of the identity module's service the Dapodik
// import needs to create and update student accounts. Satisfied directly
// by *identity/service.Service.
type IdentityPort interface {
	ListRoles(ctx context.Context, tenantID uuid.UUID) ([]identityservice.RoleView, error)
	CreateUser(ctx context.Context, tenantID, actorID uuid.UUID, in identityservice.CreateUserInput) (identityservice.UserAdminView, error)
	UpdateUser(ctx context.Context, tenantID, actorID, userID uuid.UUID, in identityservice.UserWriteInput) (identityservice.UserAdminView, error)
}
