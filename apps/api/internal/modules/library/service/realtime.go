package service

import (
	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
)

// librarianRole is the role every desk-facing live push in this module
// targets (docs/analysis/realtime-plan-2026-09-25.md section 2,
// opportunity #7): the librarian's own desk view of reservations, not the
// member who placed them (who is told separately, through the persisted
// notification inbox's existing library.reservation_ready bridge).
const librarianRole = "librarian"

// reservationEventPayload is the minimal payload pushed for both
// "library.reserved" and "library.reservation_ready" -- ids only, per the
// platform-wide payload rule; the desk re-fetches the queue through its
// already-authorized REST endpoint.
type reservationEventPayload struct {
	ReservationID uuid.UUID `json:"reservation_id"`
	TitleID       uuid.UUID `json:"title_id"`
}

// publishReservationEvent pushes eventType ("library.reserved" or
// "library.reservation_ready") to the librarian role topic for tenantID,
// carrying reservation/title ids only. Nil-safe: no Hub wired must not
// fail the use case this happens alongside.
func (s *Service) publishReservationEvent(tenantID uuid.UUID, eventType string, reservationID, titleID uuid.UUID) {
	if s.realtime == nil {
		return
	}
	_ = s.realtime.PublishRole(tenantID, librarianRole, eventType, reservationEventPayload{ReservationID: reservationID, TitleID: titleID})
}

// publishReservationReady is releaseCopyAfterReturn's caller-side publish
// point (loans.go's Return, reservations.go's CancelReservation and
// ExpireReadyReservations): called after the caller's own outer
// transaction commits, never from inside releaseCopyAfterReturn itself
// (which runs inside that transaction), so a rolled-back return/cancel/
// expiry never reaches the hub.
func (s *Service) publishReservationReady(tenantID uuid.UUID, ready domain.Reservation) {
	s.publishReservationEvent(tenantID, "library.reservation_ready", ready.ID, ready.TitleID)
}
