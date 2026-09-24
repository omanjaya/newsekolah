// Package domain holds the report schedule's entities and the pure
// cadence math: which hour a schedule is due, and the due-slot key that
// keeps an hourly wake-up from running the same schedule twice. No
// database or transport types leak in here.
package domain

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

var (
	ErrScheduleNotFound       = errors.New("report schedule not found")
	ErrInvalidCadence         = errors.New("invalid schedule cadence")
	ErrInvalidHour            = errors.New("hour must be between 0 and 23")
	ErrInvalidWeekday         = errors.New("weekday must be between 0 (Sunday) and 6 (Saturday)")
	ErrInvalidDayOfMonth      = errors.New("day of month must be between 1 and 31")
	ErrNoRecipients           = errors.New("at least one recipient email is required")
	ErrTooManyRecipients      = errors.New("too many recipients")
	ErrDuplicateRecipient     = errors.New("duplicate recipient email")
	ErrRecipientNotTenantUser = errors.New("recipient is not a user of this tenant")
	ErrReportKindNotAllowed   = errors.New("requesting user may not run this report kind")
	ErrReportKindNotFound     = errors.New("unknown report kind")
	ErrInvalidFormat          = errors.New("format must be xlsx or pdf")
	ErrScopeConflict          = errors.New("class_id and grade_level_id are mutually exclusive")
)

// MaxRecipients caps how many mailboxes one schedule can fan out to; this
// is a mail relay, not a mailing list product.
const MaxRecipients = 10

// Cadence is how often a schedule runs.
type Cadence string

const (
	CadenceDaily   Cadence = "daily"
	CadenceWeekly  Cadence = "weekly"
	CadenceMonthly Cadence = "monthly"
)

func (c Cadence) Valid() bool {
	switch c {
	case CadenceDaily, CadenceWeekly, CadenceMonthly:
		return true
	default:
		return false
	}
}

// Format is the file type a schedule renders, the same choice an
// interactive export's ReportExportDialog offers.
type Format string

const (
	FormatXLSX Format = "xlsx"
	FormatPDF  Format = "pdf"
)

func (f Format) Valid() bool {
	switch f {
	case FormatXLSX, FormatPDF:
		return true
	default:
		return false
	}
}

// WithDefault returns f, or FormatXLSX when f is empty -- every schedule
// created before this field existed (and any input that omits it) keeps
// rendering XLSX, its only format until now.
func (f Format) WithDefault() Format {
	if f == "" {
		return FormatXLSX
	}
	return f
}

// RunStatus is the outcome of one due slot's attempt.
type RunStatus string

const (
	RunStatusPending RunStatus = "pending"
	RunStatusSuccess RunStatus = "success"
	RunStatusFailed  RunStatus = "failed"
)

// Params are the same run arguments the report catalogue's RunArgs
// accepts, stored so a scheduled run can render without a live requester.
type Params struct {
	ClassID uuid.NullUUID `json:"class_id,omitempty"`
	// GradeLevelID scopes the run to every class of one grade level
	// instead of a single class; mutually exclusive with ClassID, the
	// same rule an interactive export's class_id/grade_level_id query
	// parameters follow.
	GradeLevelID uuid.NullUUID `json:"grade_level_id,omitempty"`
	SubjectID    uuid.NullUUID `json:"subject_id,omitempty"`
	TermID       uuid.NullUUID `json:"term_id,omitempty"`
}

// Schedule is one recurring export: a report kind, its parameters, when
// to run, and who receives the download link.
type Schedule struct {
	ID         uuid.UUID
	TenantID   uuid.UUID
	ReportKind string
	Params     Params
	Cadence    Cadence
	Weekday    *int // 0 (Sunday) .. 6 (Saturday); set only when Cadence == weekly
	DayOfMonth *int // 1..31; set only when Cadence == monthly, clamped to the month's last day
	Hour       int  // 0..23, in the tenant's own timezone
	Recipients []string
	Format     Format
	Enabled    bool
	CreatedBy  uuid.UUID
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

// Validate checks everything that does not require a database round trip;
// the service layer separately confirms each recipient is a tenant user
// and that the requester may run ReportKind at all.
func (s Schedule) Validate() error {
	if !s.Cadence.Valid() {
		return ErrInvalidCadence
	}
	if !s.Format.WithDefault().Valid() {
		return ErrInvalidFormat
	}
	if s.Params.ClassID.Valid && s.Params.GradeLevelID.Valid {
		return ErrScopeConflict
	}
	if s.Hour < 0 || s.Hour > 23 {
		return ErrInvalidHour
	}
	switch s.Cadence {
	case CadenceWeekly:
		if s.Weekday == nil || *s.Weekday < 0 || *s.Weekday > 6 {
			return ErrInvalidWeekday
		}
	case CadenceMonthly:
		if s.DayOfMonth == nil || *s.DayOfMonth < 1 || *s.DayOfMonth > 31 {
			return ErrInvalidDayOfMonth
		}
	case CadenceDaily:
		// No extra field required.
	}
	if err := validateRecipients(s.Recipients); err != nil {
		return err
	}
	return nil
}

func validateRecipients(recipients []string) error {
	if len(recipients) == 0 {
		return ErrNoRecipients
	}
	if len(recipients) > MaxRecipients {
		return ErrTooManyRecipients
	}
	seen := make(map[string]struct{}, len(recipients))
	for _, r := range recipients {
		if _, dup := seen[r]; dup {
			return ErrDuplicateRecipient
		}
		seen[r] = struct{}{}
	}
	return nil
}

// IsDueAt reports whether local -- already converted to the tenant's
// location -- falls in this schedule's due hour for its cadence. Only the
// hour is compared, so a job that wakes a few minutes past the top of the
// hour still matches its slot.
func (s Schedule) IsDueAt(local time.Time) bool {
	if local.Hour() != s.Hour {
		return false
	}
	switch s.Cadence {
	case CadenceDaily:
		return true
	case CadenceWeekly:
		return s.Weekday != nil && int(local.Weekday()) == *s.Weekday
	case CadenceMonthly:
		return s.DayOfMonth != nil && local.Day() == clampDayOfMonth(*s.DayOfMonth, local.Year(), local.Month())
	default:
		return false
	}
}

// NextRunAfter returns the next UTC instant this schedule will be due,
// strictly after `after`. It scans hour by hour in the tenant's own
// location rather than doing calendar arithmetic, which keeps the month
// clamp (see clampDayOfMonth) and weekday rules in one place: IsDueAt.
// A schedule passing Validate() is always due again within about a month
// of hours, well inside the scan bound below.
func (s Schedule) NextRunAfter(after time.Time, loc *time.Location) time.Time {
	local := after.In(loc)
	candidate := time.Date(local.Year(), local.Month(), local.Day(), local.Hour(), 0, 0, 0, loc).Add(time.Hour)
	const maxHoursScanned = 32 * 24 // a bit over a month, generous margin for the monthly cadence
	for i := 0; i < maxHoursScanned; i++ {
		if s.IsDueAt(candidate) {
			return candidate.UTC()
		}
		candidate = candidate.Add(time.Hour)
	}
	return time.Time{}
}

// clampDayOfMonth folds a configured day (1-31) down to the last real day
// of the given month, so "run on the 31st" still fires once in a shorter
// month instead of never firing at all.
func clampDayOfMonth(day, year int, month time.Month) int {
	last := lastDayOfMonth(year, month)
	if day > last {
		return last
	}
	return day
}

func lastDayOfMonth(year int, month time.Month) int {
	firstOfNextMonth := time.Date(year, month+1, 1, 0, 0, 0, 0, time.UTC)
	return firstOfNextMonth.AddDate(0, 0, -1).Day()
}

// SlotStart truncates local -- already in the tenant's location -- to the
// top of its hour and returns the UTC instant that identifies this due
// slot. report_schedule_runs is keyed on (schedule_id, this value), so a
// schedule already run for its slot is never run again by a second wake-up
// in the same hour.
func SlotStart(local time.Time) time.Time {
	y, m, d := local.Date()
	return time.Date(y, m, d, local.Hour(), 0, 0, 0, local.Location()).UTC()
}

// Run is one due slot's attempt at rendering and sending a schedule.
type Run struct {
	ID           uuid.UUID
	TenantID     uuid.UUID
	ScheduleID   uuid.UUID
	DueAt        time.Time
	Status       RunStatus
	ErrorMessage string
	ObjectKey    string
	RanAt        *time.Time
	CreatedAt    time.Time
}
