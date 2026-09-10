package service

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/visitors/domain"
)

type ExpectedGuestInput struct {
	FullName     string
	Organization string
	HostUserID   uuid.UUID
	Purpose      string
	ExpectedDate time.Time
	Notes        string
}

func (in ExpectedGuestInput) validate() error {
	if strings.TrimSpace(in.FullName) == "" || in.HostUserID == uuid.Nil || in.ExpectedDate.IsZero() {
		return domain.ErrInvalidInput
	}
	return nil
}

// CreateExpectedGuest lets an office enter a name ahead of a visit, so the
// guard can find it at the gate instead of typing it from scratch.
func (s *Service) CreateExpectedGuest(ctx context.Context, tenantID, createdBy uuid.UUID, in ExpectedGuestInput) (domain.ExpectedGuest, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return domain.ExpectedGuest{}, err
	}
	if err := in.validate(); err != nil {
		return domain.ExpectedGuest{}, err
	}
	var out domain.ExpectedGuest
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.CreateExpectedGuest(ctx, domain.ExpectedGuest{
			TenantID: tenantID, FullName: strings.TrimSpace(in.FullName), Organization: strings.TrimSpace(in.Organization),
			HostUserID: in.HostUserID, Purpose: strings.TrimSpace(in.Purpose), ExpectedDate: in.ExpectedDate,
			Notes: strings.TrimSpace(in.Notes), CreatedBy: createdBy,
		})
		return err
	})
	return out, err
}

// ListExpectedGuests is the guard's lookup list for one day.
func (s *Service) ListExpectedGuests(ctx context.Context, tenantID uuid.UUID, date time.Time, includeResolved bool) ([]domain.ExpectedGuest, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	var out []domain.ExpectedGuest
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListExpectedGuests(ctx, tenantID, date, includeResolved)
		return err
	})
	return out, err
}

// CancelExpectedGuest withdraws an entry the office no longer expects.
func (s *Service) CancelExpectedGuest(ctx context.Context, tenantID, id uuid.UUID) error {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return err
	}
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		guest, ok, err := s.repo.GetExpectedGuest(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrExpectedGuestNotFound
		}
		if guest.Status != domain.ExpectedPending {
			return domain.ErrExpectedGuestResolved
		}
		return s.repo.CancelExpectedGuest(ctx, tenantID, id)
	})
}
