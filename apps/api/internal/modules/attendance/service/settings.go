package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/audit"
)

// Settings is the school's attendance policy an administrator sets.
type Settings struct {
	// CorrectionDays is attendance.correction_days: how many days after a
	// session's date its own teacher, its class's homeroom teacher and a
	// global corrector may still change it. Unset reads as the default.
	CorrectionDays int
}

// AttendanceSettings returns tenantID's attendance policy, with the default
// correction window when the school has not set one.
func (s *Service) AttendanceSettings(ctx context.Context, tenantID uuid.UUID) (Settings, error) {
	var out Settings
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		days, configured, err := s.repo.GetCorrectionDays(ctx, tenantID)
		if err != nil {
			return err
		}
		if !configured {
			days = defaultCorrectionDays
		}
		out = Settings{CorrectionDays: days}
		return nil
	})
	return out, err
}

// UpdateAttendanceSettings stores a new attendance policy. A longer
// correction window reopens sessions whose deadline it moves past today,
// which is how a school corrects attendance once the window has closed.
func (s *Service) UpdateAttendanceSettings(ctx context.Context, tenantID, actorID uuid.UUID, in Settings) (Settings, error) {
	if err := domain.ValidateCorrectionDays(in.CorrectionDays); err != nil {
		return Settings{}, err
	}
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		before, configured, err := s.repo.GetCorrectionDays(ctx, tenantID)
		if err != nil {
			return err
		}
		if !configured {
			before = defaultCorrectionDays
		}
		if err := s.repo.SetCorrectionDays(ctx, tenantID, actorID, in.CorrectionDays); err != nil {
			return err
		}
		return audit.Record(ctx, tenantID, "attendance_settings.update", "tenant", tenantID,
			Settings{CorrectionDays: before}, in)
	})
	if err != nil {
		return Settings{}, err
	}
	return in, nil
}
