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
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return domain.Reservation{}, err
	}
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

// CancelReservation cancels a waiting or ready reservation. Cancelling a
// ready hold releases the copy it was set aside for: to the next waiting
// reservation if one exists, otherwise back to available (regression fix
// -- the first pass only flipped the reservation's own status and left the
// copy stuck in status reserved).
func (s *Service) CancelReservation(ctx context.Context, tenantID, reservationID uuid.UUID) (domain.Reservation, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return domain.Reservation{}, err
	}
	var reservation domain.Reservation
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		existing, found, err := s.repo.GetReservation(ctx, tenantID, reservationID)
		if err != nil {
			return err
		}
		if !found {
			return domain.ErrReservationNotFound
		}
		heldCopy := existing.HeldCopyID

		var ok bool
		reservation, ok, err = s.repo.CancelReservation(ctx, tenantID, reservationID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrReservationNotWaiting
		}
		if heldCopy.Valid {
			return s.releaseCopyAfterReturn(ctx, tenantID, heldCopy.UUID, existing.TitleID, nil)
		}
		return nil
	})
	return reservation, err
}

// QueuedReservation is one waiting reservation annotated with its 1-based
// position in the title's queue.
type QueuedReservation struct {
	domain.Reservation
	Position int
}

// ReservationQueue lists a title's waiting reservations in service order.
func (s *Service) ReservationQueue(ctx context.Context, tenantID, titleID uuid.UUID) ([]QueuedReservation, error) {
	var out []QueuedReservation
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		all, err := s.repo.ListReservationsForTitle(ctx, tenantID, titleID)
		if err != nil {
			return err
		}
		out = make([]QueuedReservation, 0, len(all))
		for _, r := range all {
			if r.Status != domain.ReservationWaiting {
				continue
			}
			out = append(out, QueuedReservation{Reservation: r, Position: domain.QueuePosition(all, r.ID)})
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

func (s *Service) MemberReservations(ctx context.Context, tenantID, memberID uuid.UUID) ([]domain.Reservation, error) {
	var reservations []domain.Reservation
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		reservations, err = s.repo.ListReservationsForMember(ctx, tenantID, memberID)
		return err
	})
	return reservations, err
}

// ExpireReadyReservations is the periodic job's body: every ready hold past
// its expires_at is expired and its copy handed to the next waiting
// reservation (or released to available), for one tenant.
func (s *Service) ExpireReadyReservations(ctx context.Context, tenantID uuid.UUID) (int, error) {
	n := 0
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		expired, err := s.repo.ExpireReadyReservations(ctx, tenantID, s.clock.Now())
		if err != nil {
			return err
		}
		for _, r := range expired {
			if !r.HeldCopyID.Valid {
				continue
			}
			if err := s.releaseCopyAfterReturn(ctx, tenantID, r.HeldCopyID.UUID, r.TitleID, nil); err != nil {
				return err
			}
			n++
		}
		return nil
	})
	return n, err
}

// ExpireReadyReservationsAllTenants runs ExpireReadyReservations for every
// active tenant, for the periodic River job.
func (s *Service) ExpireReadyReservationsAllTenants(ctx context.Context) (int, error) {
	tenants, err := s.repo.ListActiveTenants(ctx)
	if err != nil {
		return 0, err
	}
	total := 0
	for _, t := range tenants {
		n, err := s.ExpireReadyReservations(ctx, t.ID)
		if err != nil {
			return total, err
		}
		total += n
	}
	return total, nil
}
