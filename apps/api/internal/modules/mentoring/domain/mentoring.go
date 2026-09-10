// Package domain holds the mentoring module's entities and rules: how many
// students a mentor group can hold, and who may read a meeting note whose
// content can describe a child's difficulties. Nothing here imports pgx,
// chi, or gen/*, per docs/03-layered-architecture.md section 1.
package domain

import (
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
)

var (
	ErrGroupNotFound        = errors.New("mentor group not found")
	ErrGroupFull            = errors.New("mentor group has reached its member limit")
	ErrGroupSizeLimitBelow  = errors.New("group size limit must be at least 1")
	ErrMemberAlreadyInGroup = errors.New("student already assigned to a mentor group this year")
	ErrMemberNotFound       = errors.New("mentor group member not found")
	ErrNoteNotFound         = errors.New("meeting note not found")
	ErrNoteForbidden        = errors.New("meeting note not visible to this user")
	ErrSummaryNotFound      = errors.New("term summary not found")
	ErrNoActiveAcademicYear = errors.New("no active academic year")
	ErrInvalidInput         = errors.New("invalid input")
	ErrModuleDisabled       = errors.New("mentoring module is disabled for this tenant")
)

// DefaultGroupSizeLimit applies when a tenant has not set its own cap
// (mentoring_settings has no row yet).
const DefaultGroupSizeLimit = 15

// GroupSizeLimit is the tenant-configurable cap on how many students one
// mentor group may hold. A school with more than a handful of guru wali
// per angkatan wants a strict per-group ceiling, not a soft warning.
type GroupSizeLimit struct {
	TenantID uuid.UUID
	Limit    int
}

func (l GroupSizeLimit) Validate() error {
	if l.Limit < 1 {
		return ErrGroupSizeLimitBelow
	}
	return nil
}

// MentorGroup assigns one teacher to accompany a named group of students
// through one academic year.
type MentorGroup struct {
	ID             uuid.UUID
	TenantID       uuid.UUID
	AcademicYearID uuid.UUID
	MentorUserID   uuid.UUID
	Name           string
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// GroupMember is one student assigned to a MentorGroup. A student has at
// most one active membership per academic year, enforced by the unique
// constraint on (academic_year_id, student_user_id) in addition to this
// check so the service can reject the request before it ever reaches the
// database.
type GroupMember struct {
	ID            uuid.UUID
	GroupID       uuid.UUID
	StudentUserID uuid.UUID
	AssignedAt    time.Time
}

// CanAddMember reports whether group currently holding currentSize members
// may accept one more under limit. A group already at or over the limit
// (the limit was lowered after members were assigned) refuses further
// additions until it is brought back under the cap.
func CanAddMember(currentSize, limit int) bool {
	return currentSize < limit
}

// MeetingKind is who attended a mentoring session, matching how a guru
// wali actually schedules them: with the whole group, or one on one.
type MeetingKind string

const (
	MeetingGroup      MeetingKind = "group"
	MeetingIndividual MeetingKind = "individual"
)

func (k MeetingKind) Valid() bool {
	switch k {
	case MeetingGroup, MeetingIndividual:
		return true
	}
	return false
}

// MeetingNoteReader is what the service resolves about the caller before
// applying the fixed read restriction: the mentor who wrote the note
// always reads it; a counselor or a leadership duty holder also may,
// because a note can describe a child's difficulties.
type MeetingNoteReader struct {
	IsAuthor     bool
	IsCounselor  bool
	IsLeadership bool
}

// MeetingNote records one mentoring session: when, who attended, what was
// discussed, and what was agreed. Content and AgreedActions are sealed at
// rest (docs/08-security.md section 5, the same treatment discipline gives
// counseling notes) because a note may concern a child's difficulties.
type MeetingNote struct {
	ID              uuid.UUID
	TenantID        uuid.UUID
	AcademicYearID  uuid.UUID
	GroupID         uuid.UUID
	MentorUserID    uuid.UUID
	MetAt           time.Time
	Kind            MeetingKind
	AttendeeUserIDs []uuid.UUID
	Topic           string
	Content         string
	AgreedActions   string
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// VisibleTo applies the fixed restriction: mentor, counselor, leadership.
// Unlike discipline's counseling, there is no per-note visibility choice
// to configure, so the rule cannot be widened or narrowed by the author.
func (n MeetingNote) VisibleTo(r MeetingNoteReader) bool {
	return r.IsAuthor || r.IsCounselor || r.IsLeadership
}

func (n MeetingNote) Validate() error {
	if n.GroupID == uuid.Nil || n.MetAt.IsZero() || !n.Kind.Valid() {
		return ErrInvalidInput
	}
	if len(n.AttendeeUserIDs) == 0 {
		return ErrInvalidInput
	}
	if strings.TrimSpace(n.Topic) == "" || strings.TrimSpace(n.Content) == "" {
		return ErrInvalidInput
	}
	return nil
}

// TermSummary is the mentor's own written appraisal of a student for one
// term, separate from the meeting notes it may draw on.
type TermSummary struct {
	ID            uuid.UUID
	TenantID      uuid.UUID
	TermID        uuid.UUID
	GroupID       uuid.UUID
	StudentUserID uuid.UUID
	MentorUserID  uuid.UUID
	Summary       string
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

func (s TermSummary) Validate() error {
	if s.TermID == uuid.Nil || s.StudentUserID == uuid.Nil {
		return ErrInvalidInput
	}
	if strings.TrimSpace(s.Summary) == "" {
		return ErrInvalidInput
	}
	return nil
}

// StudentSnapshot is the per-student view a mentor sees, combined from
// what other modules already know rather than duplicated here: attendance,
// discipline points, and published grades read through adapters
// (apps/api/internal/wiring), never by mentoring querying their tables.
type StudentSnapshot struct {
	StudentUserID uuid.UUID
	StudentName   string
	ClassName     string
	// AttendanceByStatus is this month's day count per attendance status
	// code, using whatever codes the tenant's own status policy defines
	// (attendance has no fixed "present" code across schools).
	AttendanceByStatus    map[string]int
	DisciplinePoints      int
	DisciplineActiveCount int
	PublishedSubjects     []PublishedGrade
}

// PublishedGrade is one subject's published report score for the
// snapshot; unpublished grades are not the mentor's concern here. The
// caller resolves SubjectID to a name through the academic module if the
// presentation layer needs one; mentoring itself only reads grading.
type PublishedGrade struct {
	SubjectID uuid.UUID
	Score     float64
}
