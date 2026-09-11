package service

import (
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
)

// Actor describes who is calling an attendance operation: their broader,
// tenant-wide permissions (checked once by the transport layer against
// authz.Set, so this package never imports platform/authz), separate from
// the per-schedule/per-class scope checks this package always performs via
// scheduling.AccessChecker and the homeroom lookup.
type Actor struct {
	UserID uuid.UUID
	// CanViewAll lets a read (GetAttendanceSession, GetHomeroomAttendance,
	// the report endpoints) bypass the per-schedule/homeroom scope check,
	// for a role holding view_reports or an equivalent supervisory grant.
	CanViewAll bool
	// IsGlobalCorrector mirrors domain.SaveWindowInput's field of the same
	// name: a user holding correct_attendance may save in
	// SaveModeCorrection for any class, not just their own or their
	// homeroom's.
	IsGlobalCorrector bool
}

// RosterItem is one student's row in a session's recording payload.
type RosterItem struct {
	StudentUserID  uuid.UUID
	Name           string
	PreviousStatus string
	CurrentStatus  string
	Source         domain.EntrySource
	Notes          string
	Blocked        bool
	BlockedReason  string
}

// SessionDetail is the full payload for opening, reading, or saving one
// attendance session -- everything AttendanceSessionDetail in the OpenAPI
// contract needs.
type SessionDetail struct {
	Session              domain.Session
	IsSubstitute         bool
	MeetingNumber        int
	PreviousJournalTopic string
	Statuses             []domain.StatusDef
	Roster               []RosterItem
	JournalTopic         string
	JournalActivities    string
	JournalReflection    string
	// SkippedBlockedStudentIDs lists students SaveEntries silently skipped
	// because Blocker reported an unresolved workflow for them (e.g. a
	// late-arrival still pending review): their entry was neither saved
	// nor rejected outright, matching the old system's "siswa dengan
	// terlambat belum selesai dilewati" rule.
	SkippedBlockedStudentIDs []uuid.UUID
}

// SessionSummary is one row of ListMyAttendanceToday.
type SessionSummary struct {
	Session      domain.Session
	IsSubstitute bool
}

// CalendarDaySession is one schedule's contribution to a calendar day.
type CalendarDaySession struct {
	ScheduleID uuid.UUID
	SubjectID  uuid.UUID
	StatusCode string
}

// CalendarDay is one day of a student's month view or monthly summary.
type CalendarDay struct {
	Date              time.Time
	StatusCode        string
	ExpectedSessions  int
	SubmittedSessions int
	Complete          bool
	Sessions          []CalendarDaySession
}

// RosterEntry is one student's daily status row, shared by the homeroom
// view and the daily report.
type RosterEntry struct {
	StudentUserID     uuid.UUID
	Name              string
	StatusCode        string
	ExpectedSessions  int
	SubmittedSessions int
	Complete          bool
}

// DailyReport is one class's full daily report.
type DailyReport struct {
	ClassID           uuid.UUID
	Date              time.Time
	ExpectedSessions  int
	SubmittedSessions int
	Complete          bool
	Students          []RosterEntry
	StatusCounts      map[string]int
}

// MonitorCard is one class's current-period card on the monitor snapshot.
type MonitorCard struct {
	ClassName   string
	SubjectName string
	TeacherName string
	// Status is one of "not_started", "in_progress", "submitted".
	Status string
}

// MonitorSnapshot is the public monitor display's full payload.
type MonitorSnapshot struct {
	GeneratedAt  time.Time
	StatusCounts map[string]int
	Sessions     []MonitorCard
}

// SaveEntryInput is one student's status in a SaveEntries call.
type SaveEntryInput struct {
	StudentUserID uuid.UUID
	StatusCode    string
	Notes         string
	// ViolationIDs are this session's discipline violation type IDs for
	// this student, replacing whatever was previously recorded against
	// this session for them (see Service.violations and
	// docs/analysis/backend-inventory.md section 1.9's delete-then-reinsert
	// rule). Nil/empty clears any violations previously recorded here.
	ViolationIDs []uuid.UUID
}

// SaveJournalInput is the optional lesson journal accompanying a save.
type SaveJournalInput struct {
	Topic      string
	Activities string
	Reflection string
}

// SaveEntriesInput is everything SaveEntries needs beyond the session ID.
type SaveEntriesInput struct {
	Mode    domain.SaveMode
	Reason  string
	Entries []SaveEntryInput
	Journal *SaveJournalInput
}
