package service

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
)

// GetMonitorDisplayToken exposes the repository's tenant_settings read so
// the transport layer can gate the public monitor snapshot/WebSocket by
// the tenant's configured token without importing the repository package
// directly.
func (s *Service) GetMonitorDisplayToken(ctx context.Context, tenantID uuid.UUID) (token string, configured bool, err error) {
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		token, configured, err = s.repo.GetMonitorDisplayToken(ctx, tenantID)
		return err
	})
	return token, configured, err
}

// GetMonitorSnapshot builds the public monitor display's payload: every
// class whose current period is running right now, each card's
// not_started/in_progress/submitted state, and the day's status totals
// across the tenant.
func (s *Service) GetMonitorSnapshot(ctx context.Context, tenantID uuid.UUID) (MonitorSnapshot, error) {
	var out MonitorSnapshot
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeAcademicYear(ctx, tenantID)
		if err != nil {
			return err
		}

		loc := s.tenantLocation(ctx, tenantID)
		now := s.clock.Now().In(loc)
		today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
		dayOfWeek := domain.IsoWeekday(now)

		cards, err := s.repo.ListCurrentPeriodScheduleCards(ctx, tenantID, yearID, dayOfWeek, today, now)
		if err != nil {
			return err
		}
		sessions := make([]MonitorCard, 0, len(cards)+4)
		var currentPeriod *MonitorPeriod
		for _, c := range cards {
			status := "not_started"
			switch {
			case c.Submitted:
				status = "submitted"
			case c.SessionOpen:
				status = "in_progress"
			}
			sessions = append(sessions, MonitorCard{
				ClassName: c.ClassName, SubjectName: c.SubjectName, TeacherName: c.TeacherName,
				SubstituteName: c.SubstituteName, Status: status,
			})
			if currentPeriod == nil && c.PeriodName != "" {
				// Every card resolved against the same now_time, so they
				// all share one governing period; the first one found is
				// as good as any for the snapshot-wide banner.
				currentPeriod = &MonitorPeriod{Name: c.PeriodName, StartsAt: c.PeriodStartsAt, EndsAt: c.PeriodEndsAt}
			}
		}

		noSchedule, err := s.repo.ListClassesWithoutCurrentSchedule(ctx, tenantID, yearID, dayOfWeek, now)
		if err != nil {
			return err
		}
		for _, c := range noSchedule {
			sessions = append(sessions, MonitorCard{ClassName: c.ClassName, Status: "no_schedule"})
		}

		counts, err := s.repo.CountDailySummaryStatuses(ctx, tenantID, yearID, today)
		if err != nil {
			return err
		}

		out = MonitorSnapshot{
			GeneratedAt: s.clock.Now(), Date: today, DayName: domain.IndonesianWeekdayName(now),
			CurrentPeriod: currentPeriod, StatusCounts: counts, Sessions: sessions,
		}
		return nil
	})
	return out, err
}

// TodaySubmittedCount reports how many classes with a session running
// right now have already submitted attendance, out of how many such
// classes exist -- the same "current period" scope GetMonitorSnapshot
// uses for its cards, reused here instead of a new query so the admin/
// principal dashboard's progress figure (docs/analysis/realtime-plan-
// 2026-09-25.md section 2 opportunity #6) always agrees with what
// /monitor shows for the same moment. A class with no schedule right now
// is excluded from total, since it can never be "submitted" or not.
func (s *Service) TodaySubmittedCount(ctx context.Context, tenantID uuid.UUID) (submitted, total int, err error) {
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeAcademicYear(ctx, tenantID)
		if err != nil {
			return err
		}
		loc := s.tenantLocation(ctx, tenantID)
		now := s.clock.Now().In(loc)
		today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
		dayOfWeek := domain.IsoWeekday(now)

		cards, err := s.repo.ListCurrentPeriodScheduleCards(ctx, tenantID, yearID, dayOfWeek, today, now)
		if err != nil {
			return err
		}
		total = len(cards)
		for _, c := range cards {
			if c.Submitted {
				submitted++
			}
		}
		return nil
	})
	return submitted, total, err
}

// GetMonitorPresence reports who currently has a realtime socket open, per
// the injected PresenceReader -- platform/realtime's Presence tracker if
// the caller wired one in, or a plain hub connection count otherwise (see
// module.go's hubPresence). byRole is parsed from each key's "role:userID"
// shape (module.go's livePresence); a key that does not carry a role
// (the hub-count fallback's synthetic "monitor" key) is dropped from
// byRole but still counted in count, so the total never undercounts.
// Touches no database, so it needs no tenant transaction.
func (s *Service) GetMonitorPresence(tenantID uuid.UUID) (count int, keys []string, byRole map[string]int) {
	if s.presence == nil {
		return 0, nil, nil
	}
	count, keys = s.presence.Snapshot(tenantID)
	byRole = make(map[string]int, len(keys))
	for _, key := range keys {
		role, _, ok := strings.Cut(key, ":")
		if !ok {
			continue
		}
		byRole[role]++
	}
	return count, keys, byRole
}
