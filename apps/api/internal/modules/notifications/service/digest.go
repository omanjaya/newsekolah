package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/domain"
)

// DigestBatch is one user's daily digest content, ready for the
// "notifications.run_digest" worker to render and send: the service
// computes who is due and what to include, the worker (which alone holds
// an EmailSender) performs the actual send.
type DigestBatch struct {
	TenantID uuid.UUID
	UserID   uuid.UUID
	Email    string
	Items    []domain.Notification
}

// ComputeDueDigests loops every active tenant (never a cross-tenant query,
// per docs/08-security.md section 4) looking for users whose configured
// digest hour matches that tenant's current local hour.
func (s *Service) ComputeDueDigests(ctx context.Context) ([]DigestBatch, error) {
	tenants, err := s.repo.ListActiveTenants(ctx)
	if err != nil {
		return nil, err
	}

	var batches []DigestBatch
	var errs []error
	now := s.clock.Now()

	for _, t := range tenants {
		loc := s.tenantLocation(ctx, t.ID)
		hour := now.In(loc).Hour()

		var due []Settings
		err := s.withTx(ctx, t.ID, func(ctx context.Context) error {
			var err error
			due, err = s.repo.ListUsersDueForDigest(ctx, t.ID, hour)
			return err
		})
		if err != nil {
			errs = append(errs, err)
			continue
		}

		for _, settings := range due {
			batch, ok, err := s.buildDigestBatch(ctx, t.ID, settings)
			if err != nil {
				errs = append(errs, err)
				continue
			}
			if ok {
				batches = append(batches, batch)
			}
		}
	}
	return batches, errors.Join(errs...)
}

func (s *Service) buildDigestBatch(ctx context.Context, tenantID uuid.UUID, settings Settings) (DigestBatch, bool, error) {
	since := settings.LastDigestAt
	if since == nil {
		t := s.clock.Now().Add(-24 * time.Hour)
		since = &t
	}

	var items []domain.Notification
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		items, err = s.repo.ListUnreadSince(ctx, tenantID, settings.UserID, *since)
		return err
	})
	if err != nil {
		return DigestBatch{}, false, err
	}
	if len(items) == 0 {
		// Nothing to send, but still mark the run so the hourly job does
		// not keep re-evaluating this user within the same digest hour.
		return DigestBatch{}, false, s.MarkDigestSent(ctx, tenantID, settings.UserID)
	}

	email, ok, err := s.contacts.EmailForUser(ctx, tenantID, settings.UserID)
	if err != nil {
		return DigestBatch{}, false, err
	}
	if !ok || email == "" {
		return DigestBatch{}, false, s.MarkDigestSent(ctx, tenantID, settings.UserID)
	}

	return DigestBatch{TenantID: tenantID, UserID: settings.UserID, Email: email, Items: items}, true, nil
}

func (s *Service) MarkDigestSent(ctx context.Context, tenantID, userID uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.MarkDigestSent(ctx, tenantID, userID, s.clock.Now())
	})
}
