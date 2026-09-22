package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
)

const myHistoryLimit = 20

// MyProfile is GET /v1/library/me's payload: the old app's "pinjaman saya"
// (library_my.go) -- profile, active loans, recent history, reservations,
// and fines, for the signed-in member reading their own record.
type MyProfile struct {
	Member         *domain.Member
	ActiveLoans    []domain.Loan
	History        []domain.Loan
	Reservations   []domain.Reservation
	Violations     []domain.Violation
	BookingEnabled bool
}

func (s *Service) MyProfile(ctx context.Context, tenantID, userID uuid.UUID) (MyProfile, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return MyProfile{}, err
	}
	var out MyProfile
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if member, found, err := s.repo.GetMember(ctx, tenantID, userID); err != nil {
			return err
		} else if found {
			out.Member = &member
		}
		active, err := s.repo.ListLoansForMember(ctx, tenantID, userID, false, myHistoryLimit, 0)
		if err != nil {
			return err
		}
		out.ActiveLoans = active
		history, err := s.repo.ListLoansForMember(ctx, tenantID, userID, true, myHistoryLimit, 0)
		if err != nil {
			return err
		}
		out.History = history
		reservations, err := s.repo.ListReservationsForMember(ctx, tenantID, userID)
		if err != nil {
			return err
		}
		out.Reservations = reservations
		violations, err := s.repo.ListViolationsForMember(ctx, tenantID, userID)
		if err != nil {
			return err
		}
		out.Violations = violations
		policy, err := s.loadPolicy(ctx, tenantID)
		if err != nil {
			return err
		}
		out.BookingEnabled = policy.BookingEnabled
		return nil
	})
	if err != nil {
		return MyProfile{}, err
	}
	return out, nil
}

// ReserveForSelf is the self-service reservation path (old app:
// library_my.go:153-252 "pesan judul sendiri").
func (s *Service) ReserveForSelf(ctx context.Context, tenantID, titleID, userID uuid.UUID) (domain.Reservation, error) {
	return s.Reserve(ctx, tenantID, titleID, userID)
}

// CancelMyReservation cancels reservationID only when it belongs to
// userID (old app: library_my.go:255-295 "batalkan pesanan milik sendiri
// saja").
func (s *Service) CancelMyReservation(ctx context.Context, tenantID, reservationID, userID uuid.UUID) (domain.Reservation, error) {
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
		if existing.MemberUserID != userID {
			return domain.ErrForbidden
		}
		reservation, err = s.CancelReservation(ctx, tenantID, reservationID)
		return err
	})
	return reservation, err
}
