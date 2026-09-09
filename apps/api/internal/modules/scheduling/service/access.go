package service

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// HasAccess implements scheduling.AccessChecker: true for the schedule's
// own teacher, true for a teacher holding an accepted substitution for
// that exact schedule and date.
func (s *Service) HasAccess(ctx context.Context, tenantID, scheduleID, userID uuid.UUID, date time.Time) (bool, error) {
	var allowed bool
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		sched, err := s.repo.GetScheduleByID(ctx, tenantID, scheduleID)
		if err != nil {
			return err
		}
		if sched.TeacherUserID == userID {
			allowed = true
			return nil
		}
		_, ok, err := s.repo.GetAcceptedSubstitutionForScheduleDate(ctx, tenantID, scheduleID, userID, date)
		if err != nil {
			return err
		}
		allowed = ok
		return nil
	})
	return allowed, err
}
