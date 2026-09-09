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
	discipline DisciplineReader
}

func New(links LinkChecker, attendance AttendanceReader, grading GradingReader, discipline DisciplineReader) *Service {
	return &Service{links: links, attendance: attendance, grading: grading, discipline: discipline}
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
	return s.grading.StudentGrades(ctx, tenantID, studentID)
}

func (s *Service) ChildDiscipline(ctx context.Context, tenantID, parentID, studentID uuid.UUID) (StudentDiscipline, error) {
	if err := s.requireLink(ctx, tenantID, parentID, studentID); err != nil {
		return StudentDiscipline{}, err
	}
	return s.discipline.StudentDiscipline(ctx, tenantID, studentID)
}
