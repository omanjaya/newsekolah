package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/supervision/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

// LessonLabel names a weekly lesson for a person: its class and subject.
type LessonLabel struct {
	ClassName   string
	SubjectName string
}

// observedLesson is what a supervision notification says about the visit
// it concerns, so an inbox holding several of them can tell them apart:
// the lesson's class and subject and its date, plus the observed
// teacher's name for the observer's side.
type observedLesson struct {
	label       LessonLabel
	hasLabel    bool
	date        time.Time
	teacherName string
}

// describeLesson resolves the lesson of a scheduled observation, inside
// the use case's tenant transaction. A lesson deleted since the visit was
// planned only leaves its name out of the sentence.
func (s *Service) describeLesson(ctx context.Context, tenantID uuid.UUID, scheduleID uuid.UUID, date time.Time) (observedLesson, error) {
	label, found, err := s.repo.LessonLabel(ctx, tenantID, scheduleID)
	if err != nil {
		return observedLesson{}, err
	}
	return observedLesson{label: label, hasLabel: found, date: date}, nil
}

// withTeacherName adds the observed teacher's name; an unknown teacher
// leaves the sentence without one.
func (s *Service) withTeacherName(ctx context.Context, tenantID, teacherUserID uuid.UUID, lesson observedLesson) (observedLesson, error) {
	name, err := s.repo.TeacherName(ctx, tenantID, teacherUserID)
	if err != nil && !errors.Is(err, domain.ErrTeacherNotFound) {
		return lesson, err
	}
	lesson.teacherName = name
	return lesson, nil
}

// phrase is "X-A, Matematika pada 21 November 2026", or the date alone
// when the lesson no longer resolves. The notifications module stores the
// sentence once in Indonesian, as every other inbox body is.
func (l observedLesson) phrase() string {
	date := reportdoc.FormatDate(reportdoc.LocaleID, l.date)
	if !l.hasLabel {
		return "pada " + date
	}
	return l.label.ClassName + ", " + l.label.SubjectName + " pada " + date
}

// payload carries the lesson's details beside the sentence, for a client
// that wants to render them its own way.
func (l observedLesson) payload(into map[string]any) map[string]any {
	into["lesson_date"] = l.date.Format(time.DateOnly)
	if l.hasLabel {
		into["class_name"] = l.label.ClassName
		into["subject_name"] = l.label.SubjectName
	}
	if l.teacherName != "" {
		into["teacher_name"] = l.teacherName
	}
	return into
}

func (l observedLesson) scheduledSummary() string {
	return "Observasi pembelajaran " + l.phrase() + "."
}

func (l observedLesson) completedSummary() string {
	return "Hasil observasi " + l.phrase() + " sudah dapat dibaca dan ditanggapi."
}

func (l observedLesson) responseSummary() string {
	who := l.teacherName
	if who == "" {
		who = "Guru yang diobservasi"
	}
	return who + " menanggapi hasil observasi " + l.phrase() + "."
}
