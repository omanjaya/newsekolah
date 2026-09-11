package domain

import (
	"time"

	"github.com/google/uuid"
)

// LoanRule is a library_loan_rules row: a dated override of the tenant's
// or one member type's loan limits, including the ability to close lending
// entirely for the date range (old app's library_loan_rules,
// allow_loans=false).
type LoanRule struct {
	ID           uuid.UUID
	TenantID     uuid.UUID
	MemberTypeID uuid.NullUUID // zero value (Valid=false) applies to every type
	StartsOn     time.Time
	EndsOn       time.Time
	AllowLoans   bool
	MaxLoanItems *int
	MaxLoanDays  *int
	Notes        string
	CreatedBy    uuid.NullUUID
	CreatedAt    time.Time
}

func (r LoanRule) covers(asOf time.Time, memberTypeID uuid.UUID) bool {
	day := truncateToDay(asOf)
	if day.Before(truncateToDay(r.StartsOn)) || day.After(truncateToDay(r.EndsOn)) {
		return false
	}
	return !r.MemberTypeID.Valid || r.MemberTypeID.UUID == memberTypeID
}

// EffectiveLimits is what CanBorrow actually enforces for one member on one
// day, after resolving the old app's stated priority: a loan rule specific
// to the member's type first, then a loan rule that applies to every type,
// then the member type's own limit, then the tenant policy default.
type EffectiveLimits struct {
	AllowLoans   bool
	MaxLoanItems int
	MaxLoanDays  int
}

// ResolveEffectiveLimits applies that priority order. rules need not be
// pre-filtered to the date or member type; ResolveEffectiveLimits does
// that itself so callers can just pass every rule row the tenant has.
func ResolveEffectiveLimits(rules []LoanRule, memberType MemberType, policy Policy, asOf time.Time) EffectiveLimits {
	out := EffectiveLimits{AllowLoans: true, MaxLoanItems: memberType.MaxLoanItems, MaxLoanDays: memberType.MaxLoanDays}
	if out.MaxLoanItems <= 0 {
		out.MaxLoanItems = policy.MaxActiveLoans
	}
	if out.MaxLoanDays <= 0 {
		out.MaxLoanDays = policy.LoanDays
	}

	var specific, general *LoanRule
	for i := range rules {
		r := rules[i]
		if !r.covers(asOf, memberType.ID) {
			continue
		}
		if r.MemberTypeID.Valid {
			specific = &rules[i]
		} else {
			general = &rules[i]
		}
	}
	// A rule specific to the member's type overrides a general one.
	applied := general
	if specific != nil {
		applied = specific
	}
	if applied != nil {
		out.AllowLoans = applied.AllowLoans
		if applied.MaxLoanItems != nil {
			out.MaxLoanItems = *applied.MaxLoanItems
		}
		if applied.MaxLoanDays != nil {
			out.MaxLoanDays = *applied.MaxLoanDays
		}
	}
	return out
}

// WorkingDayRule is the tenant's weekend-closure setting plus a lookup for
// specific holiday dates (sourced from academic_calendar_events, kind
// 'holiday' -- see docs/06-database-schema.md:246, "library_holidays
// digabung ke academic_calendar_events").
type WorkingDayRule struct {
	SaturdayClosed bool
	SundayClosed   bool
	Holidays       map[string]bool // "2006-01-02" -> true
}

func (w WorkingDayRule) isHoliday(d time.Time) bool {
	if w.Holidays == nil {
		return false
	}
	return w.Holidays[d.Format("2006-01-02")]
}

// IsWorkingDay reports whether d is a day the library is open: not a
// closed weekend day and not a holiday.
func (w WorkingDayRule) IsWorkingDay(d time.Time) bool {
	switch d.Weekday() {
	case time.Saturday:
		if w.SaturdayClosed {
			return false
		}
	case time.Sunday:
		if w.SundayClosed {
			return false
		}
	}
	return !w.isHoliday(d)
}

// AddWorkingDays returns the day that is n working days after from,
// skipping closed weekend days and holidays -- the due-date and renewal
// computation the old app made (library_common.go addWorkingDays) and the
// rebuild's first pass replaced with a flat calendar AddDate.
func (w WorkingDayRule) AddWorkingDays(from time.Time, n int) time.Time {
	d := truncateToDay(from)
	for n > 0 {
		d = d.AddDate(0, 0, 1)
		if w.IsWorkingDay(d) {
			n--
		}
	}
	return d
}

// WorkingDaysLate counts the working days strictly between dueOn and
// returnedOn (exclusive of dueOn, inclusive of returnedOn), the old app's
// late_days computation (library_common.go:268-281). Zero when returnedOn
// is on or before dueOn.
func (w WorkingDayRule) WorkingDaysLate(dueOn, returnedOn time.Time) int {
	due, returned := truncateToDay(dueOn), truncateToDay(returnedOn)
	if !returned.After(due) {
		return 0
	}
	days := 0
	for d := due.AddDate(0, 0, 1); !d.After(returned); d = d.AddDate(0, 0, 1) {
		if w.IsWorkingDay(d) {
			days++
		}
	}
	return days
}

// ItemEvent is one library_item_events row: an audit trail entry for a
// single copy (old app's item_events, dropped from the rebuild's first
// circulation pass).
type ItemEvent string

const (
	EventBorrowed  ItemEvent = "borrowed"
	EventReturned  ItemEvent = "returned"
	EventRenewed   ItemEvent = "renewed"
	EventLost      ItemEvent = "lost"
	EventDamaged   ItemEvent = "damaged"
	EventReserved  ItemEvent = "reserved"
	EventStocktake ItemEvent = "stocktake"
)

// ItemEventRecord is one library_item_events row.
type ItemEventRecord struct {
	ID           uuid.UUID
	TenantID     uuid.UUID
	CopyID       uuid.UUID
	LoanID       uuid.NullUUID
	MemberUserID uuid.NullUUID
	EventType    ItemEvent
	Notes        string
	CreatedBy    uuid.NullUUID
	CreatedAt    time.Time
}

// LoanRenewal is one library_loan_renewals row: the history the old app
// kept per renewal, versus the rebuild's first pass which only bumped a
// counter on the loan itself.
type LoanRenewal struct {
	ID            uuid.UUID
	TenantID      uuid.UUID
	LoanID        uuid.UUID
	RenewedAt     time.Time
	PreviousDueOn time.Time
	NewDueOn      time.Time
	RenewedBy     uuid.UUID
}
