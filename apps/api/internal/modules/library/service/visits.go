package service

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
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

// RecordVisitResult is RecordVisit's outcome.
type RecordVisitResult struct {
	Visit domain.Visit
	// AlreadyRecorded is true when the member's visit was already recorded
	// inside the dedupe window, so Visit is that earlier row rather than a
	// new one. The caller tells the user instead of reporting a new visit.
	AlreadyRecorded bool
}

// RecordVisit logs one visit, folding it into the member's last visit if
// that was under 30 minutes ago instead of creating a duplicate (old app:
// "dedupe satu kunjungan per user per 30 menit"). A folded visit keeps its
// first purpose; a purpose given now only fills in one that was left empty,
// and the result says the visit was already recorded so the user learns
// that nothing new was saved. A member visit auto-registers the member when
// the tenant allows it, same as borrowing.
func (s *Service) RecordVisit(ctx context.Context, tenantID uuid.UUID, in RecordVisitInput) (RecordVisitResult, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return RecordVisitResult{}, err
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
	in.Purpose = strings.TrimSpace(in.Purpose)
	var result RecordVisitResult
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		now := clock.Now(ctx, s.clock)
		if in.MemberUserID.Valid {
			last, found, err := s.repo.GetLastVisitForMember(ctx, tenantID, in.MemberUserID.UUID)
			if err != nil {
				return err
			}
			if found && domain.IsDuplicateVisit(last.VisitedAt, now) {
				result = RecordVisitResult{Visit: last, AlreadyRecorded: true}
				if last.Purpose == "" && in.Purpose != "" {
					updated, ok, err := s.repo.SetVisitPurpose(ctx, tenantID, last.ID, in.Purpose)
					if err != nil {
						return err
					}
					if ok {
						result.Visit = updated
					}
				}
				return nil
			}
			if policy, err := s.loadPolicy(ctx, tenantID); err == nil && policy.AutoRegisterMembers {
				_, _ = s.resolveOrRegisterMember(ctx, tenantID, in.MemberUserID.UUID, policy, now)
			}
		}
		visit, err := s.repo.CreateVisit(ctx, domain.Visit{
			TenantID: tenantID, MemberUserID: in.MemberUserID, VisitorName: in.VisitorName, Kind: in.Kind,
			Purpose: in.Purpose, GroupSize: in.GroupSize, Source: in.Source, VisitedAt: now, CreatedBy: in.CreatedBy,
		})
		result = RecordVisitResult{Visit: visit}
		return err
	})
	return result, err
}

// TodayVisitSummary is the guest book's daily totals, in the tenant's own
// calendar day.
func (s *Service) TodayVisitSummary(ctx context.Context, tenantID uuid.UUID) (VisitSummary, error) {
	from := timeToDay(clock.Now(ctx, s.clock).In(s.tenantLocation(ctx, tenantID)))
	var summary VisitSummary
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		summary, err = s.repo.TodayVisitSummary(ctx, tenantID, from, from.AddDate(0, 0, 1))
		return err
	})
	return summary, err
}

// ListVisits is the guest book for the calendar days fromDay..toDay
// (inclusive, only their dates are read), on the school's own calendar:
// a visit at 07:30 in a UTC+8 school belongs to that local day, as in
// TodayVisitSummary.
func (s *Service) ListVisits(ctx context.Context, tenantID uuid.UUID, fromDay, toDay time.Time, limit, offset int) ([]domain.Visit, error) {
	if toDay.Before(fromDay) {
		return nil, domain.ErrInvalidInput
	}
	loc := s.tenantLocation(ctx, tenantID)
	var visits []domain.Visit
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		visits, err = s.repo.ListVisitsForRange(ctx, tenantID, fromDay, toDay, loc, clampLimit(limit), max(offset, 0))
		return err
	})
	return visits, err
}

// StartReadInPlace logs a copy being read at a library table rather than
// checked out (old app: library_read_in_place, library_visits.go:280-316).
// A copy is at one table at a time, so any session on it still open ends
// now, when the next reader starts.
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
		now := clock.Now(ctx, s.clock)
		if err := s.repo.EndOpenReadInPlaceForCopy(ctx, tenantID, copyID, now); err != nil {
			return err
		}
		created, err := s.repo.CreateReadInPlace(ctx, domain.ReadInPlace{
			TenantID: tenantID, CopyID: copyID, MemberUserID: memberUserID, VisitorName: strings.TrimSpace(visitorName),
			StartedAt: now, CreatedBy: createdBy,
		})
		if err != nil {
			return err
		}
		readInPlace = s.withReaderName(ctx, tenantID, created)
		return nil
	})
	if err != nil {
		return domain.ReadInPlace{}, err
	}
	return readInPlace, nil
}

// EndReadInPlace closes an open read-in-place session now. Ending a session
// that has already ended returns it unchanged, so a second click (or two
// librarians at once) does not fail.
func (s *Service) EndReadInPlace(ctx context.Context, tenantID, id uuid.UUID) (domain.ReadInPlace, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return domain.ReadInPlace{}, err
	}
	var readInPlace domain.ReadInPlace
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		ended, found, err := s.repo.EndReadInPlace(ctx, tenantID, id, clock.Now(ctx, s.clock))
		if err != nil {
			return err
		}
		if !found {
			ended, found, err = s.repo.GetReadInPlace(ctx, tenantID, id)
			if err != nil {
				return err
			}
			if !found {
				return domain.ErrReadInPlaceNotFound
			}
		}
		readInPlace = s.withReaderName(ctx, tenantID, ended)
		return nil
	})
	if err != nil {
		return domain.ReadInPlace{}, err
	}
	return readInPlace, nil
}

// ReadInPlaceHistory is one copy's read-in-place log, newest first, with
// each member reader's name resolved.
func (s *Service) ReadInPlaceHistory(ctx context.Context, tenantID, copyID uuid.UUID) ([]domain.ReadInPlace, error) {
	var history []domain.ReadInPlace
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		history, err = s.repo.ListReadInPlaceForCopy(ctx, tenantID, copyID)
		if err != nil {
			return err
		}
		names := make(map[uuid.UUID]string)
		for i, entry := range history {
			if !entry.MemberUserID.Valid {
				continue
			}
			name, seen := names[entry.MemberUserID.UUID]
			if !seen {
				name = s.readerName(ctx, tenantID, entry.MemberUserID.UUID)
				names[entry.MemberUserID.UUID] = name
			}
			history[i].MemberName = name
		}
		return nil
	})
	return history, err
}

// withReaderName fills in the member reader's display name.
func (s *Service) withReaderName(ctx context.Context, tenantID uuid.UUID, p domain.ReadInPlace) domain.ReadInPlace {
	if p.MemberUserID.Valid {
		p.MemberName = s.readerName(ctx, tenantID, p.MemberUserID.UUID)
	}
	return p
}

// readerName is a member's display name, empty when it cannot be resolved
// (the client then falls back to the visitor name).
func (s *Service) readerName(ctx context.Context, tenantID, userID uuid.UUID) string {
	if s.members == nil {
		return ""
	}
	name, err := s.members.UserDisplayName(ctx, tenantID, userID)
	if err != nil {
		return ""
	}
	return name
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
func (s *Service) ScanKioskVisit(ctx context.Context, tenantID uuid.UUID, rawToken string, scannedBy uuid.UUID) (RecordVisitResult, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return RecordVisitResult{}, err
	}
	if s.scanTokens == nil {
		return RecordVisitResult{}, domain.ErrInvalidInput
	}
	if err := s.scanTokens.ConsumeLibraryVisitToken(ctx, tenantID, rawToken, scannedBy); err != nil {
		return RecordVisitResult{}, err
	}
	return s.RecordVisit(ctx, tenantID, RecordVisitInput{
		MemberUserID: uuid.NullUUID{UUID: scannedBy, Valid: true}, Kind: domain.VisitMember, Source: domain.VisitSourceKiosk,
		GroupSize: 1, CreatedBy: uuid.NullUUID{UUID: scannedBy, Valid: true},
	})
}
