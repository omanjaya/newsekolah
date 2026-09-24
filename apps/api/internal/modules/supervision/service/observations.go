package service

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/supervision/domain"
)

type ScheduleObservationInput struct {
	CycleID        uuid.UUID
	ScheduleID     uuid.UUID
	LessonDate     time.Time
	ObserverUserID uuid.UUID
}

// ScheduleObservation plans a visit to a specific lesson, resolving the
// teacher through the scheduling module's own record rather than trusting
// a caller-supplied teacher id.
func (s *Service) ScheduleObservation(ctx context.Context, tenantID uuid.UUID, in ScheduleObservationInput) (domain.ScheduledObservation, error) {
	var out domain.ScheduledObservation
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.requireEnabled(ctx, tenantID); err != nil {
			return err
		}
		if _, ok, err := s.repo.GetCycle(ctx, tenantID, in.CycleID); err != nil {
			return err
		} else if !ok {
			return domain.ErrCycleNotFound
		}
		lesson, err := s.schedules.GetSchedule(ctx, tenantID, in.ScheduleID)
		if err != nil {
			return domain.ErrLessonNotResolved
		}
		scheduled := domain.ScheduledObservation{
			TenantID: tenantID, CycleID: in.CycleID, ScheduleID: in.ScheduleID, LessonDate: in.LessonDate,
			TeacherUserID: lesson.TeacherUserID, ObserverUserID: in.ObserverUserID,
		}
		if err := scheduled.Validate(); err != nil {
			return err
		}
		out, err = s.repo.CreateScheduledObservation(ctx, scheduled)
		return err
	})
	return out, err
}

func (s *Service) ListScheduledForCycle(ctx context.Context, tenantID, cycleID uuid.UUID) ([]domain.ScheduledObservation, error) {
	var out []domain.ScheduledObservation
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListScheduledForCycle(ctx, tenantID, cycleID)
		return err
	})
	return out, err
}

func (s *Service) ListScheduledForTeacher(ctx context.Context, tenantID, cycleID, teacherUserID uuid.UUID) ([]domain.ScheduledObservation, error) {
	var out []domain.ScheduledObservation
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListScheduledForTeacher(ctx, tenantID, cycleID, teacherUserID)
		return err
	})
	return out, err
}

type CompleteObservationInput struct {
	ScheduledID     uuid.UUID
	Scores          []domain.CriterionScore
	ObserverNotes   string
	TeacherResponse string
	AgreedFollowUp  string
	ObservedAt      time.Time
}

// CompleteObservation records the finished visit: the scores (validated
// against the cycle's instrument scale), the observer's notes, the
// teacher's response, and the agreed follow-up.
func (s *Service) CompleteObservation(ctx context.Context, tenantID, observerUserID uuid.UUID, in CompleteObservationInput) (domain.Observation, error) {
	var out domain.Observation
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.requireEnabled(ctx, tenantID); err != nil {
			return err
		}
		scheduled, ok, err := s.repo.GetScheduledObservation(ctx, tenantID, in.ScheduledID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrScheduledNotFound
		}
		if _, done, err := s.repo.GetObservationByScheduled(ctx, tenantID, in.ScheduledID); err != nil {
			return err
		} else if done {
			return domain.ErrScheduledAlreadyDone
		}
		cycle, ok, err := s.repo.GetCycle(ctx, tenantID, scheduled.CycleID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrCycleNotFound
		}
		if err := cycle.Instrument.ValidateScores(in.Scores); err != nil {
			return err
		}
		observation := domain.Observation{
			ScheduledID: scheduled.ID, CycleID: scheduled.CycleID, TeacherUserID: scheduled.TeacherUserID, ObserverUserID: observerUserID,
			Scores: in.Scores, ObserverNotes: strings.TrimSpace(in.ObserverNotes), TeacherResponse: strings.TrimSpace(in.TeacherResponse),
			AgreedFollowUp: strings.TrimSpace(in.AgreedFollowUp), ObservedAt: in.ObservedAt,
		}
		if err := observation.Validate(); err != nil {
			return err
		}
		out, err = s.repo.CreateObservation(ctx, observation)
		return err
	})
	return out, err
}

// RecordTeacherResponse lets the observed teacher add their response and
// the agreed follow-up after reading the observer's notes.
func (s *Service) RecordTeacherResponse(ctx context.Context, tenantID, id, teacherUserID uuid.UUID, response, followUp string) (domain.Observation, error) {
	var out domain.Observation
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.requireEnabled(ctx, tenantID); err != nil {
			return err
		}
		current, ok, err := s.repo.GetObservation(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrObservationNotFound
		}
		if current.TeacherUserID != teacherUserID {
			return domain.ErrObservationForbidden
		}
		current.TeacherResponse, current.AgreedFollowUp = strings.TrimSpace(response), strings.TrimSpace(followUp)
		out, err = s.repo.UpdateObservation(ctx, current)
		return err
	})
	return out, err
}

// GetObservation returns the completed record for a reader the fixed rule
// allows: the observer, leadership, or the observed teacher reading their
// own, per the brief.
func (s *Service) GetObservation(ctx context.Context, tenantID, id, readerUserID uuid.UUID) (domain.Observation, error) {
	var out domain.Observation
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		obs, ok, err := s.repo.GetObservation(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrObservationNotFound
		}
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		role, err := s.observationReaderRole(ctx, tenantID, yearID, readerUserID, obs.ObserverUserID, obs.TeacherUserID)
		if err != nil {
			return err
		}
		if !obs.VisibleTo(role) {
			return domain.ErrObservationForbidden
		}
		out = obs
		return nil
	})
	return out, err
}
