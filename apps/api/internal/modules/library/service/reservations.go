package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
)

// Reserve places a member in the queue for a title. It refuses to reserve
// a title that already has an available copy on the shelf -- the member
// should just borrow it.
func (s *Service) Reserve(ctx context.Context, tenantID, titleID, memberUserID uuid.UUID) (domain.Reservation, error) {
	var reservation domain.Reservation
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if _, found, err := s.repo.GetTitle(ctx, tenantID, titleID); err != nil {
			return err
		} else if !found {
			return domain.ErrTitleNotFound
		}
		available, err := s.repo.CountAvailableCopies(ctx, tenantID, titleID)
		if err != nil {
			return err
		}
		if available > 0 {
			return domain.ErrCopyAvailableForLoan
		}
		reservation, err = s.repo.CreateReservation(ctx, domain.Reservation{
			TenantID: tenantID, TitleID: titleID, MemberUserID: memberUserID, RequestedAt: s.clock.Now(),
		})
		return err
	})
	return reservation, err
}

func (s *Service) CancelReservation(ctx context.Context, tenantID, reservationID uuid.UUID) (domain.Reservation, error) {
	reservation, found, err := s.repo.CancelReservation(ctx, tenantID, reservationID)
	if err != nil {
		return domain.Reservation{}, err
	}
	if !found {
		return domain.Reservation{}, domain.ErrReservationNotWaiting
	}
	return reservation, nil
}

// QueuedReservation is one waiting reservation annotated with its 1-based
// position in the title's queue.
type QueuedReservation struct {
	domain.Reservation
	Position int
}

// ReservationQueue lists a title's waiting reservations in service order.
func (s *Service) ReservationQueue(ctx context.Context, tenantID, titleID uuid.UUID) ([]QueuedReservation, error) {
	all, err := s.repo.ListReservationsForTitle(ctx, tenantID, titleID)
	if err != nil {
		return nil, err
	}
	out := make([]QueuedReservation, 0, len(all))
	for _, r := range all {
		if r.Status != domain.ReservationWaiting {
			continue
		}
		out = append(out, QueuedReservation{Reservation: r, Position: domain.QueuePosition(all, r.ID)})
	}
	return out, nil
}

func (s *Service) MemberReservations(ctx context.Context, tenantID, memberID uuid.UUID) ([]domain.Reservation, error) {
	return s.repo.ListReservationsForMember(ctx, tenantID, memberID)
}
