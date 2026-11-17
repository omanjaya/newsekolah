// Package domain holds the notifications module's entities and pure
// business rules: notification kinds and channels, preference resolution,
// and quiet-hours arithmetic. No database or HTTP imports, per
// docs/03-layered-architecture.md section 1.
package domain

import (
	"time"

	"github.com/google/uuid"
)

// Kind identifies why a notification was sent. Values mirror the domain
// events the module subscribes to (see platform/events/names.go) plus
// "announcement_published" for manual announcements.
type Kind string

const (
	KindAttendanceSubmitted        Kind = "attendance_submitted"
	KindSubstitutionRequested      Kind = "substitution_requested"
	KindSubstitutionResponded      Kind = "substitution_responded"
	KindLeaveRequestSubmitted      Kind = "leave_request_submitted"
	KindLeaveRequestReviewed       Kind = "leave_request_reviewed"
	KindLeaveRequestIssued         Kind = "leave_request_issued"
	KindExitPermitStageChanged     Kind = "exit_permit_stage_changed"
	KindExitPermitIssued           Kind = "exit_permit_issued"
	KindExitPermitExited           Kind = "exit_permit_exited"
	KindLateArrivalOpened          Kind = "late_arrival_opened"
	KindLateArrivalUpdated         Kind = "late_arrival_updated"
	KindWarningLetterIssued        Kind = "warning_letter_issued"
	KindDisciplineThresholdReached Kind = "discipline_threshold_reached"
	KindAnnouncementPublished      Kind = "announcement_published"
	KindLibraryReservationReady    Kind = "library_reservation_ready"
	KindLibraryLoanDueReminder     Kind = "library_loan_due_reminder"
)

// AllKinds is every notification kind this module writes.
var AllKinds = []Kind{
	KindAttendanceSubmitted, KindSubstitutionRequested, KindSubstitutionResponded,
	KindLeaveRequestSubmitted, KindLeaveRequestReviewed, KindLeaveRequestIssued,
	KindExitPermitStageChanged, KindExitPermitIssued, KindExitPermitExited,
	KindLateArrivalOpened, KindLateArrivalUpdated,
	KindWarningLetterIssued, KindDisciplineThresholdReached,
	KindAnnouncementPublished,
	KindLibraryReservationReady, KindLibraryLoanDueReminder,
}

// Toggleable feature modules (the platform's feature_flags.module values)
// that own notification kinds. Named here as plain strings so this module
// never imports the platform module; a wiring test keeps them in step with
// the platform's module list.
const (
	ModulePermits       = "permits"
	ModuleDiscipline    = "discipline"
	ModuleAnnouncements = "announcements"
	ModuleLibrary       = "library"
)

// Module names the toggleable feature module whose notifications these
// are, or "" for a kind that belongs to an always-on module (attendance,
// scheduling's substitutions) and is therefore never hidden. A school that
// switches a module off stops seeing that module's notifications in the
// inbox, the unread count and the daily digest (HiddenKinds); the rows are
// kept, so they come back when the module is switched on again.
func (k Kind) Module() string {
	switch k {
	case KindLeaveRequestSubmitted, KindLeaveRequestReviewed, KindLeaveRequestIssued,
		KindExitPermitStageChanged, KindExitPermitIssued, KindExitPermitExited,
		KindLateArrivalOpened, KindLateArrivalUpdated:
		return ModulePermits
	case KindWarningLetterIssued, KindDisciplineThresholdReached:
		return ModuleDiscipline
	case KindAnnouncementPublished:
		return ModuleAnnouncements
	case KindLibraryReservationReady, KindLibraryLoanDueReminder:
		return ModuleLibrary
	default:
		return ""
	}
}

// NotificationModules lists every module some kind belongs to, in a fixed
// order: the modules whose on/off state decides what HiddenKinds hides.
func NotificationModules() []string {
	var out []string
	seen := map[string]bool{}
	for _, k := range AllKinds {
		if m := k.Module(); m != "" && !seen[m] {
			seen[m] = true
			out = append(out, m)
		}
	}
	return out
}

// HiddenKinds returns, as strings ready for a query filter, every kind
// whose module is in disabled. It is never nil, so a filter built from it
// with nothing disabled still matches every row.
func HiddenKinds(disabled []string) []string {
	off := make(map[string]bool, len(disabled))
	for _, m := range disabled {
		off[m] = true
	}
	hidden := []string{}
	for _, k := range AllKinds {
		if m := k.Module(); m != "" && off[m] {
			hidden = append(hidden, string(k))
		}
	}
	return hidden
}

// Channel is a delivery channel a preference can enable or disable.
// Matches the notification_preferences.channel check constraint.
type Channel string

const (
	ChannelInApp    Channel = "inapp"
	ChannelPush     Channel = "push"
	ChannelWhatsApp Channel = "whatsapp"
	ChannelEmail    Channel = "email"
)

// AllChannels is every channel a preference row can target, in the order
// the preferences API returns them.
var AllChannels = []Channel{ChannelInApp, ChannelPush, ChannelWhatsApp, ChannelEmail}

func (c Channel) Valid() bool {
	switch c {
	case ChannelInApp, ChannelPush, ChannelWhatsApp, ChannelEmail:
		return true
	default:
		return false
	}
}

// Notification is one inbox entry.
type Notification struct {
	ID             uuid.UUID
	TenantID       uuid.UUID
	UserID         uuid.UUID
	Kind           Kind
	Title          string
	Body           string
	Href           string
	Data           map[string]any
	AnnouncementID uuid.NullUUID
	ReadAt         *time.Time
	CreatedAt      time.Time
}

// Page is a cursor-paginated slice of notifications.
type Page struct {
	Items      []Notification
	NextCursor string
}
