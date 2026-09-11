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
