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
	if member, found, err := s.repo.GetMember(ctx, tenantID, userID); err != nil {
		return MyProfile{}, err
	} else if found {
		out.Member = &member
	}
	active, err := s.repo.ListLoansForMember(ctx, tenantID, userID, false, myHistoryLimit, 0)
	if err != nil {
		return MyProfile{}, err
	}
	out.ActiveLoans = active
	history, err := s.repo.ListLoansForMember(ctx, tenantID, userID, true, myHistoryLimit, 0)
	if err != nil {
		return MyProfile{}, err
	}
	out.History = history
	reservations, err := s.repo.ListReservationsForMember(ctx, tenantID, userID)
	if err != nil {
		return MyProfile{}, err
	}
	out.Reservations = reservations
	violations, err := s.repo.ListViolationsForMember(ctx, tenantID, userID)
	if err != nil {
		return MyProfile{}, err
	}
	out.Violations = violations
	policy, err := s.loadPolicy(ctx, tenantID)
	if err != nil {
		return MyProfile{}, err
	}
	out.BookingEnabled = policy.BookingEnabled
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
	existing, found, err := s.repo.GetReservation(ctx, tenantID, reservationID)
	if err != nil {
		return domain.Reservation{}, err
	}
	if !found {
		return domain.Reservation{}, domain.ErrReservationNotFound
	}
	if existing.MemberUserID != userID {
		return domain.Reservation{}, domain.ErrForbidden
	}
	return s.CancelReservation(ctx, tenantID, reservationID)
}
