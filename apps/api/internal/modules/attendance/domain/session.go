package domain

import (
	"time"

	"github.com/google/uuid"
)

// EntrySource records where an attendance_entries row came from. "leave"
// and "permit" are written by the not-yet-merged permits module once it
// exists (an issued leave letter or an approved exit permit overriding a
// status); "system" is reserved for automated corrections (e.g. a
// materialization job). Today only "teacher" is ever produced.
type EntrySource string

const (
	SourceTeacher EntrySource = "teacher"
	SourceLeave   EntrySource = "leave"
	SourcePermit  EntrySource = "permit"
	SourceSystem  EntrySource = "system"
)

// Session is one held (or about to be held) meeting of a schedule on a
// specific date.
type Session struct {
	ID               uuid.UUID
	TenantID         uuid.UUID
	AcademicYearID   uuid.UUID
	ScheduleID       uuid.UUID
	Date             time.Time
	ClassID          uuid.UUID
	SubjectID        uuid.UUID
	TeacherUserID    uuid.UUID
	SubstituteUserID uuid.NullUUID
	StartPeriodID    uuid.UUID
	EndPeriodID      uuid.UUID
	Notes            string
	SubmittedAt      *time.Time
	SubmittedBy      uuid.NullUUID
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

// IsSubmitted reports whether attendance for this session has already been
// recorded at least once (subsequent saves within the window are
// corrections/amendments, not the first submit).
func (s Session) IsSubmitted() bool { return s.SubmittedAt != nil }

// Entry is one student's recorded status for a session.
type Entry struct {
	ID            uuid.UUID
	TenantID      uuid.UUID
	SessionID     uuid.UUID
	StudentUserID uuid.UUID
	StatusCode    string
	Source        EntrySource
	Notes         string
	RecordedBy    uuid.NullUUID
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

// Correction is an audit row written whenever a save changes an already
// recorded entry's status under SaveModeCorrection.
type Correction struct {
	ID          uuid.UUID
	TenantID    uuid.UUID
	EntryID     uuid.UUID
	OldStatus   string
	NewStatus   string
	Reason      string
	CorrectedBy uuid.UUID
	CorrectedAt time.Time
}
