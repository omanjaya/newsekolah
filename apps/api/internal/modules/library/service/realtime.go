package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
)

// librarianRole is the role every desk-facing live push in this module
// targets (docs/analysis/realtime-plan-2026-09-25.md section 2,
// opportunity #7): the librarian's own desk view of reservations, not the
// member who placed them (who is told separately, through the persisted
// notification inbox's existing library.reservation_ready bridge).
const librarianRole = "librarian"

// librarianDuty is the duty_types.slug seeded by authz.DutyTypeDefaults
// under the name "Petugas Perpustakaan" -- added 25 September 2026 so the
// same desk push also reaches a duty holder who does not carry the
// librarian role itself (e.g. a teacher or other staff member rostered
// onto library circulation duty). Tenant-wide, like "counselor"/
// "leadership"/"security" in permits/service/realtime.go's
// dutySlugForStage -- never class-scoped, unlike "homeroom".
const librarianDuty = "librarian"

// reservationEventPayload is the minimal payload pushed for both
// "library.reserved" and "library.reservation_ready" -- ids only, per the
// platform-wide payload rule; the desk re-fetches the queue through its
// already-authorized REST endpoint.
type reservationEventPayload struct {
	ReservationID uuid.UUID `json:"reservation_id"`
	TitleID       uuid.UUID `json:"title_id"`
}

// publishReservationEvent pushes eventType ("library.reserved" or
// "library.reservation_ready") to both the librarian role topic and the
// librarian duty topic for tenantID, carrying reservation/title ids only.
// Nil-safe: no Hub wired must not fail the use case this happens
// alongside. Publishing to both is deliberate: a reader who holds the
// role, the duty, or both must be reached exactly once per topic they
// actually subscribe to (apps/web/features/library/realtime.ts).
func (s *Service) publishReservationEvent(ctx context.Context, tenantID uuid.UUID, eventType string, reservationID, titleID uuid.UUID) {
	if s.realtime == nil {
		return
	}
	payload := reservationEventPayload{ReservationID: reservationID, TitleID: titleID}
	_ = s.realtime.PublishRole(tenantID, librarianRole, eventType, payload)
	_ = s.realtime.PublishToDuty(ctx, tenantID, librarianDuty, uuid.NullUUID{}, eventType, payload)
}

// publishReservationReady is releaseCopyAfterReturn's caller-side publish
// point (loans.go's Return, reservations.go's CancelReservation and
// ExpireReadyReservations): called after the caller's own outer
// transaction commits, never from inside releaseCopyAfterReturn itself
// (which runs inside that transaction), so a rolled-back return/cancel/
// expiry never reaches the hub.
func (s *Service) publishReservationReady(ctx context.Context, tenantID uuid.UUID, ready domain.Reservation) {
	s.publishReservationEvent(ctx, tenantID, "library.reservation_ready", ready.ID, ready.TitleID)
}
