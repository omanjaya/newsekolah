package academic

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/service"
)

// YearReader is the narrow read surface a module needs from academic
// years and terms -- e.g. scheduling resolving "this year's second term"
// without owning that table. See docs/03-layered-architecture.md section 1
// on cross-module communication.
type YearReader interface {
	GetAcademicYear(ctx context.Context, tenantID, id uuid.UUID) (domain.AcademicYear, error)
	ListTerms(ctx context.Context, tenantID, yearID uuid.UUID) ([]domain.Term, error)
}

// ClassReader is the narrow read surface a module needs from classes and
// enrollments -- e.g. permits resolving a student's homeroom teacher, or
// attendance resolving which class a student belongs to.
type ClassReader interface {
	GetClass(ctx context.Context, tenantID, id uuid.UUID) (domain.Class, error)
	GetEnrollment(ctx context.Context, tenantID, id uuid.UUID) (domain.Enrollment, error)
}

// PeriodReader is the narrow read surface a module needs from period
// templates -- e.g. attendance resolving the period in session right now.
type PeriodReader interface {
	ListPeriods(ctx context.Context, tenantID, templateID uuid.UUID) ([]domain.Period, error)
	PeriodsToday(ctx context.Context, tenantID, yearID uuid.UUID, dayOfWeek int16, now domain.ClockTime) (domain.Period, bool, error)
}

// TeachingReader is the narrow read surface a module needs to check
// whether a teacher is assigned to teach a subject in a class -- e.g.
// grading refusing to accept scores from a teacher with no assignment
// there.
type TeachingReader interface {
	RequireTeachingAssignment(ctx context.Context, tenantID, yearID, teacherID, subjectID, classID uuid.UUID) error
}

// Compile-time assertions that Service satisfies every reader interface
// this module exports, so a signature drift in service/ fails the build
// here instead of surfacing only when another module wires one of these in.
var (
	_ YearReader     = (*service.Service)(nil)
	_ ClassReader    = (*service.Service)(nil)
	_ PeriodReader   = (*service.Service)(nil)
	_ TeachingReader = (*service.Service)(nil)
)
