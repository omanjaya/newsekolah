package domain

import (
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

// MemberStatus is the state of one library_members row.
type MemberStatus string

const (
	MemberPending   MemberStatus = "pending"
	MemberActive    MemberStatus = "active"
	MemberInactive  MemberStatus = "inactive"
	MemberSuspended MemberStatus = "suspended"
	MemberCleared   MemberStatus = "cleared"
)

func (s MemberStatus) Valid() bool {
	switch s {
	case MemberPending, MemberActive, MemberInactive, MemberSuspended, MemberCleared:
		return true
	}
	return false
}

// Role is the identity module's user kind, used to pick a member type's
// default_for_role and to scope bulk registration.
type Role string

const (
	RoleStudent Role = "student"
	RoleTeacher Role = "teacher"
	RoleStaff   Role = "staff"
)

// MemberType is a library_member_types row: the per-type loan limits and
// fine rules the old app kept separate from a single tenant-wide policy.
type MemberType struct {
	ID             uuid.UUID
	TenantID       uuid.UUID
	Name           string
	MaxLoanItems   int
	MaxLoanDays    int
	RenewalDays    int
	MaxRenewals    int
	FineType       FineType
	FinePerTenor   int
	TenorDays      int
	SuspendDays    int
	ValidityMonths int
	DefaultForRole string
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// FineType is how a member type charges for a late return when currency
// fines are enabled tenant-wide.
type FineType string

const (
	FineConstant FineType = "constant"
	FinePerTenor FineType = "per_tenor"
)

func (f FineType) Valid() bool {
	switch f {
	case FineConstant, FinePerTenor:
		return true
	}
	return false
}

func (t MemberType) Validate() error {
	if strings.TrimSpace(t.Name) == "" || len(t.Name) > 100 {
		return ErrInvalidInput
	}
	if t.MaxLoanItems <= 0 || t.MaxLoanDays <= 0 || t.RenewalDays <= 0 || t.MaxRenewals < 0 ||
		t.TenorDays <= 0 || t.FinePerTenor < 0 || t.SuspendDays < 0 || t.ValidityMonths <= 0 {
		return ErrInvalidInput
	}
	if !t.FineType.Valid() {
		return ErrInvalidInput
	}
	return nil
}

// Member is a library_members row: the profile the old app tracked
// alongside a user account -- member number, type, validity window,
// status, and the running late-return count that feeds suspension.
type Member struct {
	UserID          uuid.UUID
	TenantID        uuid.UUID
	MemberNo        string
	MemberTypeID    uuid.UUID
	RegisteredOn    time.Time
	ValidUntil      *time.Time
	Status          MemberStatus
	SuspendedUntil  *time.Time
	LateReturnCount int
	Notes           string
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// EligibleToBorrow is the member half of borrowing eligibility (old app's
// "status anggota harus aktif, suspend lewat tanggal dianggap aktif,
// valid_until belum lewat"): a suspended member whose suspension window has
// passed is treated as active, same as the old app, rather than requiring
// a separate reactivation step just to borrow again.
func (m Member) EligibleToBorrow(asOf time.Time) error {
	switch m.Status {
	case MemberActive:
		// falls through to the validity check below
	case MemberSuspended:
		if m.SuspendedUntil == nil || !asOf.After(*m.SuspendedUntil) {
			return ErrMemberSuspended
		}
	default:
		return ErrMemberNotActive
	}
	if m.ValidUntil != nil && asOf.After(*m.ValidUntil) {
		return ErrMemberExpired
	}
	return nil
}

// EligibleForClearance is true only when clearance ("bebas pustaka") can be
// granted: no active loans and no unpaid fines, mirroring the old app's
// library_members.go clearance check.
func EligibleForClearance(activeLoanCount int, hasUnpaidFine bool) bool {
	return activeLoanCount == 0 && !hasUnpaidFine
}

// ValidUntilFromRegistration derives a member's validity date from their
// type's validity_months, the same computation the old app made once at
// registration time.
func ValidUntilFromRegistration(registeredOn time.Time, validityMonths int) time.Time {
	return registeredOn.AddDate(0, validityMonths, 0)
}

// GenerateMemberNo renders pattern (e.g. "PS-YYYY-99999") for year and a
// 1-based sequence number: "YYYY" becomes the 4-digit year, and each run of
// consecutive '9' characters becomes seq zero-padded to that run's width.
// Pure so the numbering scheme can be unit tested without a database; the
// caller is responsible for retrying with the next sequence value on a
// unique-constraint collision (old app retried 5 times).
func GenerateMemberNo(pattern string, year, seq int) string {
	out := strings.ReplaceAll(pattern, "YYYY", strconv.Itoa(year))
	var b strings.Builder
	i := 0
	for i < len(out) {
		if out[i] == '9' {
			j := i
			for j < len(out) && out[j] == '9' {
				j++
			}
			width := j - i
			b.WriteString(padLeftZero(seq, width))
			i = j
			continue
		}
		b.WriteByte(out[i])
		i++
	}
	return b.String()
}

func padLeftZero(n, width int) string {
	s := strconv.Itoa(n)
	if len(s) >= width {
		return s
	}
	return strings.Repeat("0", width-len(s)) + s
}
