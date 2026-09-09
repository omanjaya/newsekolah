package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
)

// ForceStatus applies a status decided by another workflow (an issued leave
// letter, an exit permit) to every session of the student's class whose
// period range overlaps [from, to]. Sessions that do not exist yet are not
// created: the Overrider hook applies the same rule when a teacher opens
// them later, so both paths agree. from/to are instants in the tenant's
// timezone; a whole-day leave passes midnight to 23:59:59.
func (s *Service) ForceStatus(ctx context.Context, tenantID, studentUserID uuid.UUID, from, to time.Time, statusCode, source, reason string) error {
	if !to.After(from) {
		return nil
	}
	entrySource := domain.EntrySource(source)
	switch entrySource {
	case domain.SourceLeave, domain.SourcePermit, domain.SourceSystem:
	default:
		return fmt.Errorf("force status: unsupported source %q", source)
	}

	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, ok, err := s.years.GetActiveAcademicYearID(ctx, tenantID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrNoActiveAcademicYear
		}
		policy, err := s.loadStatusPolicy(ctx, tenantID)
		if err != nil {
			return err
		}
		if !policy.IsValid(statusCode) {
			return domain.ErrInvalidStatusCode
		}
		classID, ok, err := s.repo.GetEnrolledClass(ctx, tenantID, yearID, studentUserID)
		if err != nil {
			return err
		}
		if !ok {
			return nil
		}
		loc := s.tenantLocation(ctx, tenantID)

		touched := map[time.Time]struct{}{}
		for day := startOfDayIn(from, loc); !day.After(to); day = day.AddDate(0, 0, 1) {
			changed, err := s.forceDay(ctx, tenantID, classID, studentUserID, day, from, to, statusCode, entrySource, reason, loc)
			if err != nil {
				return err
			}
			if changed {
				touched[day] = struct{}{}
			}
		}
		for day := range touched {
			if err := s.recomputeDailySummaryForClassDate(ctx, tenantID, yearID, classID, day, []uuid.UUID{studentUserID}, policy); err != nil {
				return err
			}
		}
		return nil
	})
}

// forceDay upserts the forced status into every session of day whose
// period window overlaps [from, to]; it reports whether anything changed.
func (s *Service) forceDay(ctx context.Context, tenantID, classID, studentUserID uuid.UUID, day, from, to time.Time, statusCode string, source domain.EntrySource, reason string, loc *time.Location) (bool, error) {
	sessions, err := s.repo.ListSessionsByClassDate(ctx, tenantID, classID, day)
	if err != nil {
		return false, err
	}
	changed := false
	for _, session := range sessions {
		startAt, endAt, err := s.sessionWindow(ctx, tenantID, session, loc)
		if err != nil {
			return false, err
		}
		if endAt.Before(from) || startAt.After(to) {
			continue
		}
		if _, err := s.repo.UpsertEntry(ctx, domain.Entry{
			TenantID: tenantID, SessionID: session.ID, StudentUserID: studentUserID,
			StatusCode: statusCode, Source: source, Notes: reason,
		}); err != nil {
			return false, fmt.Errorf("force status for session %s: %w", session.ID, err)
		}
		changed = true
	}
	return changed, nil
}

func (s *Service) sessionWindow(ctx context.Context, tenantID uuid.UUID, session domain.Session, loc *time.Location) (time.Time, time.Time, error) {
	start, err := s.repo.GetPeriodStartTime(ctx, tenantID, session.StartPeriodID)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	end, err := s.repo.GetPeriodEndTime(ctx, tenantID, session.EndPeriodID)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	day := startOfDayIn(session.Date, loc)
	return day.Add(start), day.Add(end), nil
}

func startOfDayIn(t time.Time, loc *time.Location) time.Time {
	y, m, d := t.In(loc).Date()
	return time.Date(y, m, d, 0, 0, 0, 0, loc)
}
