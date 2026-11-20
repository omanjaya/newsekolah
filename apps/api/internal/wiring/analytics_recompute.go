package wiring

import (
	"context"
	"log/slog"

	"github.com/google/uuid"

	disciplineservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/events"
)

// StudentRiskRecomputer rescores a few students' early-warning results now
// (analytics/service.Service.RecomputeStudents).
type StudentRiskRecomputer interface {
	RecomputeStudents(ctx context.Context, tenantID uuid.UUID, studentIDs []uuid.UUID) error
}

// RegisterAnalyticsRecompute keeps early warning current with discipline:
// recording or voiding a violation and issuing a warning letter rescore
// that student in the same transaction (discipline publishes these events
// inside it, under a savepoint), instead of leaving the risk list, the
// student's profile summary and the counselor's "Siswa berisiko" block on
// the nightly run's figures. A rescoring failure is logged and never fails
// the discipline write.
func RegisterAnalyticsRecompute(bus *events.Bus, analytics StudentRiskRecomputer, logger *slog.Logger) {
	rescore := func(ctx context.Context, name string, tenantID, studentID uuid.UUID) error {
		if err := analytics.RecomputeStudents(ctx, tenantID, []uuid.UUID{studentID}); err != nil {
			logger.WarnContext(ctx, "analytics: rescore after discipline change failed", "event", name, "error", err)
		}
		return nil
	}
	bus.Subscribe(disciplineservice.ViolationRecorded{}.EventName(), func(ctx context.Context, evt events.Event) error {
		e, ok := evt.(disciplineservice.ViolationRecorded)
		if !ok {
			return nil
		}
		return rescore(ctx, e.EventName(), e.TenantID, e.StudentUserID)
	})
	bus.Subscribe(disciplineservice.ViolationVoided{}.EventName(), func(ctx context.Context, evt events.Event) error {
		e, ok := evt.(disciplineservice.ViolationVoided)
		if !ok {
			return nil
		}
		return rescore(ctx, e.EventName(), e.TenantID, e.StudentUserID)
	})
	bus.Subscribe(disciplineservice.WarningLetterIssued{}.EventName(), func(ctx context.Context, evt events.Event) error {
		e, ok := evt.(disciplineservice.WarningLetterIssued)
		if !ok {
			return nil
		}
		return rescore(ctx, e.EventName(), e.TenantID, e.StudentUserID)
	})
}
