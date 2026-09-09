package service

import "github.com/omanjaya/newsekolah/apps/api/internal/platform/events"

// EventCatalog is every event type a webhook endpoint may subscribe to,
// drawn from platform/events' name constants (docs/14-public-api.md lists
// the same set for API consumers). A module publishing a new domain event
// only needs to add its name constant to platform/events and to this list
// for it to become subscribable; the dispatcher in module.go already
// subscribes to the whole catalog generically.
var EventCatalog = []string{
	events.AttendanceSubmitted,
	events.SubstitutionRequested,
	events.SubstitutionResponded,
	events.LeaveRequestSubmitted,
	events.LeaveRequestReviewed,
	events.LeaveRequestIssued,
	events.ExitPermitStageChanged,
	events.ExitPermitIssued,
	events.ExitPermitExited,
	events.LateArrivalOpened,
	events.LateArrivalUpdated,
	events.WarningLetterIssued,
	events.AnnouncementPublished,
}

func isKnownEventType(eventType string) bool {
	for _, e := range EventCatalog {
		if e == eventType {
			return true
		}
	}
	return false
}
