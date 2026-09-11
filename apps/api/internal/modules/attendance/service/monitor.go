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
		sessions := make([]MonitorCard, 0, len(cards))
		for _, c := range cards {
			status := "not_started"
			switch {
			case c.Submitted:
				status = "submitted"
			case c.SessionOpen:
				status = "in_progress"
			}
			sessions = append(sessions, MonitorCard{ClassName: c.ClassName, SubjectName: c.SubjectName, TeacherName: c.TeacherName, Status: status})
		}

		counts, err := s.repo.CountDailySummaryStatuses(ctx, tenantID, yearID, today)
		if err != nil {
			return err
		}

		out = MonitorSnapshot{GeneratedAt: s.clock.Now(), StatusCounts: counts, Sessions: sessions}
		return nil
	})
	return out, err
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
