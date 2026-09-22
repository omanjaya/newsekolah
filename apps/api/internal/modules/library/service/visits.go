package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
)

// RecordVisitInput is one guest-book entry.
type RecordVisitInput struct {
	MemberUserID uuid.NullUUID
	VisitorName  string
	Kind         domain.VisitKind
	Purpose      string
	GroupSize    int
	Source       domain.VisitSource
	CreatedBy    uuid.NullUUID
}

// RecordVisit logs one visit, folding it into the member's last visit if
// that was under 30 minutes ago instead of creating a duplicate (old app:
// "dedupe satu kunjungan per user per 30 menit"). A member visit
// auto-registers the member when the tenant allows it, same as borrowing.
func (s *Service) RecordVisit(ctx context.Context, tenantID uuid.UUID, in RecordVisitInput) (domain.Visit, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return domain.Visit{}, err
	}
	if !in.Kind.Valid() {
		in.Kind = domain.VisitNonMember
	}
	if !in.Source.Valid() {
		in.Source = domain.VisitSourceManual
	}
	if in.GroupSize <= 0 {
		in.GroupSize = 1
	}
	var visit domain.Visit
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		now := s.clock.Now()
		if in.MemberUserID.Valid {
			last, found, err := s.repo.GetLastVisitForMember(ctx, tenantID, in.MemberUserID.UUID)
			if err != nil {
				return err
			}
			if found && domain.IsDuplicateVisit(last.VisitedAt, now) {
				visit = last
				return nil
			}
			if policy, err := s.loadPolicy(ctx, tenantID); err == nil && policy.AutoRegisterMembers {
				_, _ = s.resolveOrRegisterMember(ctx, tenantID, in.MemberUserID.UUID, policy, now)
			}
		}
		var err error
		visit, err = s.repo.CreateVisit(ctx, domain.Visit{
			TenantID: tenantID, MemberUserID: in.MemberUserID, VisitorName: in.VisitorName, Kind: in.Kind,
			Purpose: in.Purpose, GroupSize: in.GroupSize, Source: in.Source, VisitedAt: now, CreatedBy: in.CreatedBy,
		})
		return err
	})
	return visit, err
}

// TodayVisitSummary is the guest book's daily totals, in the tenant's own
// calendar day.
func (s *Service) TodayVisitSummary(ctx context.Context, tenantID uuid.UUID) (VisitSummary, error) {
	loc := time.UTC
	if tz, err := s.repo.GetTenantTimezone(ctx, tenantID); err == nil && tz != "" {
		if l, err := time.LoadLocation(tz); err == nil {
			loc = l
		}
	}
	now := s.clock.Now().In(loc)
	from := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	var summary VisitSummary
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		summary, err = s.repo.TodayVisitSummary(ctx, tenantID, from, from.AddDate(0, 0, 1))
		return err
	})
	return summary, err
}

func (s *Service) ListVisits(ctx context.Context, tenantID uuid.UUID, from, to time.Time) ([]domain.Visit, error) {
	var visits []domain.Visit
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		visits, err = s.repo.ListVisitsForRange(ctx, tenantID, from, to)
		return err
	})
	return visits, err
}

// StartReadInPlace logs a copy being read at a library table rather than
// checked out (old app: library_read_in_place, library_visits.go:280-316).
func (s *Service) StartReadInPlace(ctx context.Context, tenantID uuid.UUID, copyID uuid.UUID, memberUserID uuid.NullUUID, visitorName string, createdBy uuid.NullUUID) (domain.ReadInPlace, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return domain.ReadInPlace{}, err
	}
	var readInPlace domain.ReadInPlace
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if _, found, err := s.repo.GetCopy(ctx, tenantID, copyID); err != nil {
			return err
		} else if !found {
			return domain.ErrCopyNotFound
		}
		var err error
		readInPlace, err = s.repo.CreateReadInPlace(ctx, domain.ReadInPlace{
			TenantID: tenantID, CopyID: copyID, MemberUserID: memberUserID, VisitorName: visitorName,
			StartedAt: s.clock.Now(), CreatedBy: createdBy,
		})
		return err
	})
	if err != nil {
		return domain.ReadInPlace{}, err
	}
	return readInPlace, nil
}

func (s *Service) ReadInPlaceHistory(ctx context.Context, tenantID, copyID uuid.UUID) ([]domain.ReadInPlace, error) {
	var history []domain.ReadInPlace
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		history, err = s.repo.ListReadInPlaceForCopy(ctx, tenantID, copyID)
		return err
	})
	return history, err
}

// IssueKioskVisitToken mints a scan token the library kiosk shows for a
// member to scan themselves in with; ScanTokens is nil until wiring
// connects the permits module's token pipeline, in which case the kiosk
// falls back to manual/staff-recorded visits.
func (s *Service) IssueKioskVisitToken(ctx context.Context, tenantID, issuedBy uuid.UUID) (string, time.Time, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return "", time.Time{}, err
	}
	if s.scanTokens == nil {
		return "", time.Time{}, domain.ErrInvalidInput
	}
	return s.scanTokens.IssueLibraryVisitToken(ctx, tenantID, issuedBy)
}

// ScanKioskVisit consumes a kiosk token and records the visit for the
// scanning user -- any authenticated user may scan (old app: "scan oleh
// user login mana pun").
func (s *Service) ScanKioskVisit(ctx context.Context, tenantID uuid.UUID, rawToken string, scannedBy uuid.UUID) (domain.Visit, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return domain.Visit{}, err
	}
	if s.scanTokens == nil {
		return domain.Visit{}, domain.ErrInvalidInput
	}
	if err := s.scanTokens.ConsumeLibraryVisitToken(ctx, tenantID, rawToken, scannedBy); err != nil {
		return domain.Visit{}, err
	}
	return s.RecordVisit(ctx, tenantID, RecordVisitInput{
		MemberUserID: uuid.NullUUID{UUID: scannedBy, Valid: true}, Kind: domain.VisitMember, Source: domain.VisitSourceKiosk,
		GroupSize: 1, CreatedBy: uuid.NullUUID{UUID: scannedBy, Valid: true},
	})
}
