// Package service composes the read-only parent view: a parent asks about
// one of their children and gets that child's attendance, grades and
// discipline. Every call proves the link first, so a parent can never
// read a student they are not connected to.
package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
)

var (
	ErrNotLinked = errors.New("not a guardian of this student")
	// ErrLeaveCategoryInvalid, ErrLeaveDateRangeInvalid,
	// ErrLeaveGuardianNotApproving and ErrLeaveHomeroomRequired mirror
	// permits' own domain errors (translated by the wiring adapter, see
	// internal/wiring's FamilyLeaveRequests) so this module never imports
	// permits' domain package directly.
	ErrLeaveCategoryInvalid      = errors.New("leave category is invalid")
	ErrLeaveDateRangeInvalid     = errors.New("leave request end date must not be before start date")
	ErrLeaveGuardianNotApproving = errors.New("guardian does not have leave-approval rights for this student")
	ErrLeaveHomeroomRequired     = errors.New("the student's class has no active homeroom teacher to review this request")
	ErrLeaveAlreadyInProgress    = errors.New("student already has an in-progress leave request today")
)

// LinkChecker is identity's parent-student link.
type LinkChecker interface {
	IsParentOf(ctx context.Context, tenantID, parentID, studentID uuid.UUID) (bool, error)
}

// The three readers below are the owning modules, reached through wiring
// adapters so family never imports them directly.
type AttendanceReader interface {
	StudentMonth(ctx context.Context, tenantID, studentID uuid.UUID, month string) ([]CalendarDay, map[string]int, error)
}

type GradingReader interface {
	StudentGrades(ctx context.Context, tenantID, studentID uuid.UUID) (StudentGrades, error)
}

// SubjectReader resolves subject names for the child grades response.
// Parents cannot call /v1/academic/subjects themselves (they lack
// view_academic_data), so the family module must name each subject
// itself rather than leaving that to the web client.
type SubjectReader interface {
	SubjectNames(ctx context.Context, tenantID uuid.UUID, ids []uuid.UUID) (map[uuid.UUID]string, error)
}

type DisciplineReader interface {
	StudentDiscipline(ctx context.Context, tenantID, studentID uuid.UUID) (StudentDiscipline, error)
}

// LeaveRequestSubmitter is what family needs from permits to let a
// guardian open a planned leave request for a linked child, reached
// through a wiring adapter like every other cross-module reader here.
type LeaveRequestSubmitter interface {
	SubmitChildLeaveRequest(
		ctx context.Context, tenantID, guardianUserID, studentUserID uuid.UUID,
		category, reason string, startsOn, endsOn time.Time,
	) (uuid.UUID, error)
}

// CalendarDay mirrors attendance's own day shape, flattened for transport.
type CalendarDay struct {
	Date              string
	StatusCode        string
	ExpectedSessions  int
	SubmittedSessions int
	Complete          bool
}

type StudentGrades struct {
	TermID   uuid.UUID
	TermName string
	Subjects []SubjectGrade
	Stars    int
}

type SubjectGrade struct {
	SubjectID   uuid.UUID
	SubjectName string
	Average     *float64
	ReportScore *float64
}

type StudentDiscipline struct {
	TotalPoints int
	Records     []DisciplineRecord
	Letters     []DisciplineLetter
}

type DisciplineRecord struct {
	TypeName   string
	Points     int
	OccurredOn string
}

type DisciplineLetter struct {
	Number     string
	LevelLabel string
	IssuedAt   string
}

type Service struct {
	links         LinkChecker
	attendance    AttendanceReader
	grading       GradingReader
	subjects      SubjectReader
	discipline    DisciplineReader
	leaveRequests LeaveRequestSubmitter
}

func New(
	links LinkChecker, attendance AttendanceReader, grading GradingReader, subjects SubjectReader,
	discipline DisciplineReader, leaveRequests LeaveRequestSubmitter,
) *Service {
	return &Service{
		links: links, attendance: attendance, grading: grading, subjects: subjects,
		discipline: discipline, leaveRequests: leaveRequests,
	}
}

func (s *Service) requireLink(ctx context.Context, tenantID, parentID, studentID uuid.UUID) error {
	ok, err := s.links.IsParentOf(ctx, tenantID, parentID, studentID)
	if err != nil {
		return err
	}
	if !ok {
		return ErrNotLinked
	}
	return nil
}

func (s *Service) ChildAttendance(ctx context.Context, tenantID, parentID, studentID uuid.UUID, month string) ([]CalendarDay, map[string]int, error) {
	if err := s.requireLink(ctx, tenantID, parentID, studentID); err != nil {
		return nil, nil, err
	}
	return s.attendance.StudentMonth(ctx, tenantID, studentID, month)
}

func (s *Service) ChildGrades(ctx context.Context, tenantID, parentID, studentID uuid.UUID) (StudentGrades, error) {
	if err := s.requireLink(ctx, tenantID, parentID, studentID); err != nil {
		return StudentGrades{}, err
	}
	grades, err := s.grading.StudentGrades(ctx, tenantID, studentID)
	if err != nil {
		return StudentGrades{}, err
	}
	if len(grades.Subjects) == 0 {
		return grades, nil
	}
	ids := make([]uuid.UUID, len(grades.Subjects))
	for i, subject := range grades.Subjects {
		ids[i] = subject.SubjectID
	}
	names, err := s.subjects.SubjectNames(ctx, tenantID, ids)
	if err != nil {
		return StudentGrades{}, err
	}
	for i := range grades.Subjects {
		grades.Subjects[i].SubjectName = names[grades.Subjects[i].SubjectID]
	}
	return grades, nil
}

func (s *Service) ChildDiscipline(ctx context.Context, tenantID, parentID, studentID uuid.UUID) (StudentDiscipline, error) {
	if err := s.requireLink(ctx, tenantID, parentID, studentID); err != nil {
		return StudentDiscipline{}, err
	}
	return s.discipline.StudentDiscipline(ctx, tenantID, studentID)
}

// SubmitChildLeaveRequest opens a planned leave request for a linked
// child on the guardian's behalf. The link check here only proves the
// caller is *a* guardian of the student (same bar as the read endpoints
// above); the adapter's underlying permits call additionally requires the
// stricter "approving guardian" link, since that is the same relationship
// that will later decide this exact request.
func (s *Service) SubmitChildLeaveRequest(
	ctx context.Context, tenantID, parentID, studentID uuid.UUID,
	category, reason string, startsOn, endsOn time.Time,
) (uuid.UUID, error) {
	if err := s.requireLink(ctx, tenantID, parentID, studentID); err != nil {
		return uuid.Nil, err
	}
	return s.leaveRequests.SubmitChildLeaveRequest(ctx, tenantID, parentID, studentID, category, reason, startsOn, endsOn)
}
