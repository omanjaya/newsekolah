package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
)

// EventPublisher is the narrow slice of platform/events.Bus the service
// needs. Declared here (the consumer) mirrors identity/service's pattern
// for auth.TokenIssuer/RateLimiter, but events.Event is trivial enough
// (one method) that this package imports it directly rather than
// redeclaring an equivalent type.
type EventPublisher interface {
	Publish(ctx context.Context, evt Event) error
}

// Event is the method set platform/events.Event requires; declared here so
// this package's exported event types satisfy both without importing
// platform/events for anything but this one interface at the module.go
// wiring boundary.
type Event interface {
	EventName() string
}

// SubstitutionRequested and SubstitutionResponded are published for the
// notifications module to consume once it is merged in; today they only
// reach whatever handlers module.go subscribes (none, yet).
type SubstitutionRequested struct {
	TenantID         uuid.UUID
	SubstitutionID   uuid.UUID
	ScheduleID       uuid.UUID
	Date             time.Time
	RequesterUserID  uuid.UUID
	SubstituteUserID uuid.UUID
}

func (SubstitutionRequested) EventName() string { return "scheduling.substitution_requested" }

type SubstitutionResponded struct {
	TenantID         uuid.UUID
	SubstitutionID   uuid.UUID
	ScheduleID       uuid.UUID
	Date             time.Time
	RequesterUserID  uuid.UUID
	SubstituteUserID uuid.UUID
	Accepted         bool
}

func (SubstitutionResponded) EventName() string { return "scheduling.substitution_responded" }

// RequestSubstitution validates and creates a substitution request. Only
// the schedule's own teacher (or an admin acting for them) may request one;
// the transport layer passes requesterUserID as the schedule's teacher when
// it authorizes the call, so the service just double-checks it matches.
func (s *Service) RequestSubstitution(
	ctx context.Context, tenantID uuid.UUID, scheduleID uuid.UUID, date time.Time,
	requesterUserID, substituteUserID uuid.UUID, note string, publisher EventPublisher,
) (domain.Substitution, error) {
	var created domain.Substitution
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		sched, err := s.repo.GetScheduleByID(ctx, tenantID, scheduleID)
		if err != nil {
			return domain.ErrScheduleNotFound
		}
		if sched.TeacherUserID != requesterUserID {
			return domain.ErrTeacherEditForbidden
		}

		if err := domain.ValidateNewSubstitution(requesterUserID, substituteUserID, sched.DayOfWeek, date); err != nil {
			return err
		}

		if _, ok, err := s.repo.GetActiveSubstitutionForScheduleDate(ctx, tenantID, scheduleID, date); err != nil {
			return err
		} else if ok {
			return domain.ErrSubstitutionDuplicateActive
		}

		// The substitute need not already teach this exact class/subject
		// (docs/analysis/backend-inventory.md section 1.13 only requires
		// "pengganti guru aktif di tahun aktif" -- an active teacher this
		// year, not necessarily of this class); IsActiveTeacher checks
		// that broader condition.
		if ok, err := s.repo.IsActiveTeacher(ctx, tenantID, sched.AcademicYearID, substituteUserID); err != nil || !ok {
			return domain.ErrSubstituteNotTeacher
		}

		created, err = s.repo.CreateSubstitution(ctx, domain.Substitution{
			TenantID: tenantID, AcademicYearID: sched.AcademicYearID, ScheduleID: scheduleID, Date: date,
			RequesterUserID: requesterUserID, SubstituteUserID: substituteUserID, RequesterNote: note,
		})
		return err
	})
	if err != nil {
		return domain.Substitution{}, err
	}

	_ = publisher.Publish(ctx, SubstitutionRequested{
		TenantID: tenantID, SubstitutionID: created.ID, ScheduleID: scheduleID, Date: date,
		RequesterUserID: requesterUserID, SubstituteUserID: substituteUserID,
	})
	return created, nil
}

func (s *Service) RespondSubstitution(ctx context.Context, tenantID, id, responderUserID uuid.UUID, accept bool, note string, publisher EventPublisher) (domain.Substitution, error) {
	var updated domain.Substitution
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		existing, err := s.repo.GetSubstitutionByID(ctx, tenantID, id)
		if err != nil {
			return domain.ErrSubstitutionNotFound
		}
		if err := existing.CanRespond(responderUserID); err != nil {
			return err
		}

		status := domain.SubstitutionRejected
		if accept {
			status = domain.SubstitutionAccepted
		}
		updated, err = s.repo.RespondSubstitution(ctx, tenantID, id, status, note)
		return err
	})
	if err != nil {
		return domain.Substitution{}, err
	}

	_ = publisher.Publish(ctx, SubstitutionResponded{
		TenantID: tenantID, SubstitutionID: updated.ID, ScheduleID: updated.ScheduleID, Date: updated.Date,
		RequesterUserID: updated.RequesterUserID, SubstituteUserID: updated.SubstituteUserID, Accepted: accept,
	})
	return updated, nil
}

func (s *Service) CancelSubstitution(ctx context.Context, tenantID, id, cancellerUserID uuid.UUID) (domain.Substitution, error) {
	var updated domain.Substitution
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		existing, err := s.repo.GetSubstitutionByID(ctx, tenantID, id)
		if err != nil {
			return domain.ErrSubstitutionNotFound
		}
		if err := existing.CanCancel(cancellerUserID); err != nil {
			return err
		}
		updated, err = s.repo.CancelSubstitution(ctx, tenantID, id)
		return err
	})
	return updated, err
}

func (s *Service) ListSubstitutionsIncoming(ctx context.Context, tenantID, userID uuid.UUID) ([]domain.Substitution, error) {
	var out []domain.Substitution
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListSubstitutionsIncoming(ctx, tenantID, userID)
		return err
	})
	return out, err
}

func (s *Service) ListSubstitutionsOutgoing(ctx context.Context, tenantID, userID uuid.UUID) ([]domain.Substitution, error) {
	var out []domain.Substitution
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListSubstitutionsOutgoing(ctx, tenantID, userID)
		return err
	})
	return out, err
}
