// Package service composes the read-only parent view: a parent asks about
// one of their children and gets that child's attendance, grades and
// discipline. Every call proves the link first, so a parent can never
// read a student they are not connected to.
package service

import (
	"context"
	"errors"

	"github.com/google/uuid"
)

var ErrNotLinked = errors.New("not a guardian of this student")

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
	links      LinkChecker
	attendance AttendanceReader
	grading    GradingReader
	subjects   SubjectReader
	discipline DisciplineReader
}

func New(links LinkChecker, attendance AttendanceReader, grading GradingReader, subjects SubjectReader, discipline DisciplineReader) *Service {
	return &Service{links: links, attendance: attendance, grading: grading, subjects: subjects, discipline: discipline}
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
