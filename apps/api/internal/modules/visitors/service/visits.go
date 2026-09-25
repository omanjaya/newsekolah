package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/visitors/domain"
)

type CheckInInput struct {
	ExpectedGuestID uuid.NullUUID
	FullName        string
	Organization    string
	HostUserID      uuid.UUID
	Purpose         string
	IDChecked       bool
	IDType          domain.IdentificationType
}

func (in CheckInInput) validate() error {
	if strings.TrimSpace(in.FullName) == "" || in.HostUserID == uuid.Nil || !in.IDType.Valid() {
		return domain.ErrInvalidInput
	}
	if in.IDChecked && in.IDType == domain.IDTypeNone {
		return domain.ErrInvalidInput
	}
	return nil
}

// CheckIn signs a guest into the gate board and prints their badge through
// the permits module's document pipeline. When an expected-guest entry is
// referenced, it is marked arrived so it drops off the office's pending
// list.
func (s *Service) CheckIn(ctx context.Context, tenantID, guardUserID uuid.UUID, in CheckInInput) (domain.Visit, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return domain.Visit{}, err
	}
	if err := in.validate(); err != nil {
		return domain.Visit{}, err
	}
	var out domain.Visit
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if in.ExpectedGuestID.Valid {
			guest, ok, err := s.repo.GetExpectedGuest(ctx, tenantID, in.ExpectedGuestID.UUID)
			if err != nil {
				return err
			}
			if !ok {
				return domain.ErrExpectedGuestNotFound
			}
			if guest.Status != domain.ExpectedPending {
				return domain.ErrExpectedGuestResolved
			}
			if _, _, err := s.repo.SetExpectedGuestStatus(ctx, tenantID, guest.ID, domain.ExpectedArrived); err != nil {
				return err
			}
		}

		now := s.clock.Now()
		visit := domain.Visit{
			TenantID: tenantID, ExpectedGuestID: in.ExpectedGuestID, FullName: strings.TrimSpace(in.FullName),
			Organization: strings.TrimSpace(in.Organization), HostUserID: in.HostUserID, Purpose: strings.TrimSpace(in.Purpose),
			IDChecked: in.IDChecked, IDType: in.IDType, ArrivedAt: now, CheckedInBy: guardUserID,
		}
		created, err := s.repo.CreateVisit(ctx, visit)
		if err != nil {
			return err
		}

		badge, err := s.issueBadge(ctx, tenantID, guardUserID, created)
		if err != nil {
			return fmt.Errorf("issue visitor badge: %w", err)
		}
		created.BadgeNumber, created.BadgeAssetID = badge.Number, badge.AssetID
		out = created
		return nil
	})
	if err != nil {
		return domain.Visit{}, err
	}
	s.publishBoardEvent(ctx, tenantID, "visitor.checked_in", out.ID)
	return out, nil
}

// issueBadge numbers and renders the badge through the permits pipeline, or
// falls back to a locally numbered badge with no PDF when no document
// issuer is wired (tests, or a deployment without the permits storage
// configured).
func (s *Service) issueBadge(ctx context.Context, tenantID, guardUserID uuid.UUID, v domain.Visit) (IssuedBadge, error) {
	if s.docs == nil {
		return IssuedBadge{Number: fmt.Sprintf("TAMU-%s", s.clock.Now().Format("20060102-150405"))}, nil
	}
	yearID, _, err := s.activeYear(ctx, tenantID)
	if err != nil {
		return IssuedBadge{}, err
	}
	return s.docs.IssueVisitorBadge(ctx, tenantID, BadgeDocument{
		VisitID: v.ID, AcademicYearID: yearID, IssuerUserID: guardUserID,
		Vars: map[string]any{
			"visitor_name": v.FullName, "organization": v.Organization, "purpose": v.Purpose,
			"arrived_at": v.ArrivedAt.Format("02-01-2006 15:04"),
		},
	})
}

// BuiltinVisitorBadgeHTML is the template used until a school uploads its
// own under document_templates (kind visitor_badge). It deliberately
// prints only what the gate already collected: no document number, no
// photograph.
const BuiltinVisitorBadgeHTML = `<html><body style="font-family: sans-serif; font-size: 14pt; margin: 24px; text-align: center;">
<h2 style="margin-bottom: 4px;">TAMU</h2>
<p style="font-size: 20pt; font-weight: bold; margin: 8px 0;">{{.visitor_name}}</p>
<p>{{.organization}}</p>
<p>Keperluan: {{.purpose}}</p>
<p>Masuk: {{.arrived_at}}</p>
<p style="margin-top: 24px;">No. Badge: <strong>{{.letter_number}}</strong></p>
</body></html>`

// CheckOut is the one action the gate board offers for a visitor already
// on campus: sign them out.
func (s *Service) CheckOut(ctx context.Context, tenantID, id, guardUserID uuid.UUID) (domain.Visit, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return domain.Visit{}, err
	}
	var out domain.Visit
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		visit, ok, err := s.repo.GetVisit(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrVisitNotFound
		}
		if !visit.OnCampus() {
			return domain.ErrVisitAlreadyCheckedOut
		}
		updated, _, err := s.repo.CheckOutVisit(ctx, tenantID, id, s.clock.Now(), guardUserID)
		if err != nil {
			return err
		}
		out = updated
		return nil
	})
	if err != nil {
		return domain.Visit{}, err
	}
	s.publishBoardEvent(ctx, tenantID, "visitor.checked_out", out.ID)
	return out, nil
}

// visitorBoardPayload is the minimal payload pushed to the gate board --
// the visit id only; the board re-fetches through its already-authorized
// REST endpoint.
type visitorBoardPayload struct {
	VisitID uuid.UUID `json:"visit_id"`
}

// publishBoardEvent is a nil-safe wrapper over RealtimePublisher.
// PublishBoard, so CheckIn/CheckOut do not repeat the nil-check.
func (s *Service) publishBoardEvent(ctx context.Context, tenantID uuid.UUID, eventType string, visitID uuid.UUID) {
	if s.realtime == nil {
		return
	}
	_ = s.realtime.PublishBoard(ctx, tenantID, eventType, visitorBoardPayload{VisitID: visitID})
}

// BadgeURL presigns the printable badge for one visit, if one was issued.
func (s *Service) BadgeURL(ctx context.Context, tenantID, id uuid.UUID) (string, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return "", err
	}
	if s.docs == nil {
		return "", domain.ErrVisitNotFound
	}
	var out string
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		visit, ok, err := s.repo.GetVisit(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrVisitNotFound
		}
		if !visit.BadgeAssetID.Valid {
			return domain.ErrVisitNotFound
		}
		out, err = s.docs.DocumentURL(ctx, tenantID, visit.BadgeAssetID.UUID)
		return err
	})
	return out, err
}

func (s *Service) GetVisit(ctx context.Context, tenantID, id uuid.UUID) (domain.Visit, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return domain.Visit{}, err
	}
	var out domain.Visit
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		visit, ok, err := s.repo.GetVisit(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrVisitNotFound
		}
		out = visit
		return nil
	})
	return out, err
}

// Board is the screen a guard actually works from: everyone on campus
// right now, flagged when they have overstayed a normal campus day.
func (s *Service) Board(ctx context.Context, tenantID uuid.UUID) ([]domain.BoardEntry, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	var visits []domain.Visit
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		visits, err = s.repo.ListOnCampus(ctx, tenantID)
		return err
	})
	if err != nil {
		return nil, err
	}
	return domain.Board(visits, s.clock.Now()), nil
}

// ListVisits is the visit history for a date range, most recent first.
func (s *Service) ListVisits(ctx context.Context, tenantID uuid.UUID, from, to time.Time, limit, offset int) ([]domain.Visit, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var out []domain.Visit
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListVisits(ctx, tenantID, from, to, limit, max(offset, 0))
		return err
	})
	return out, err
}
