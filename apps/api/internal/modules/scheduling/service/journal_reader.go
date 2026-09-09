package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
)

// JournalRef is the minimal shape of a class journal the attendance module
// needs (to prefill "previous_journal_topic" and to upsert the journal a
// teacher writes alongside attendance), without attendance importing
// scheduling/domain's fuller Journal type. Mirrors ScheduleRef's rationale
// in schedule_reader.go.
type JournalRef struct {
	ID         uuid.UUID
	Topic      string
	Activities string
	Reflection string
}

// JournalServiceAdapter implements scheduling.JournalService over a
// *Service, converting domain.Journal to the narrower JournalRef the same
// way ScheduleReaderAdapter converts domain.Schedule to ScheduleRef.
type JournalServiceAdapter struct {
	svc *Service
}

func NewJournalServiceAdapter(svc *Service) *JournalServiceAdapter {
	return &JournalServiceAdapter{svc: svc}
}

func (a *JournalServiceAdapter) UpsertJournal(ctx context.Context, tenantID, teacherUserID, writerUserID uuid.UUID, in JournalInput) (JournalRef, error) {
	j, err := a.svc.UpsertJournal(ctx, tenantID, teacherUserID, writerUserID, in)
	if err != nil {
		return JournalRef{}, err
	}
	return toJournalRef(j), nil
}

// GetJournalForLesson looks up the journal already written for
// (teacher, class, subject, lessonDate), if any -- used by attendance to
// prefill "previous_journal_topic" from the prior lesson, and internally
// by UpsertJournal to decide insert vs. update.
func (a *JournalServiceAdapter) GetJournalForLesson(ctx context.Context, tenantID, academicYearID, teacherUserID, classID, subjectID uuid.UUID, lessonDate time.Time) (JournalRef, bool, error) {
	var out domain.Journal
	var found bool
	err := a.svc.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, found, err = a.svc.repo.GetJournalByUnique(ctx, tenantID, academicYearID, teacherUserID, classID, subjectID, lessonDate)
		return err
	})
	if err != nil {
		return JournalRef{}, false, err
	}
	if !found {
		return JournalRef{}, false, nil
	}
	return toJournalRef(out), true, nil
}

func toJournalRef(j domain.Journal) JournalRef {
	return JournalRef{ID: j.ID, Topic: j.Topic, Activities: j.Activities, Reflection: j.Reflection}
}
