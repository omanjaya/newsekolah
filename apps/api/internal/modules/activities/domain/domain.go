// Package domain holds the activities module's entities and the rules a
// school actually enforces around extracurriculars: a club's seat
// capacity, how many clubs one student may hold at once, and whether a
// membership counts as active during a given term (docs/03-layered-
// architecture.md section 1: no pgx, chi, or gen/* imports here).
package domain

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

var (
	ErrClubNotFound         = errors.New("extracurricular not found")
	ErrClubNameExists       = errors.New("extracurricular name already used this year")
	ErrClubInactive         = errors.New("extracurricular is inactive")
	ErrClubFull             = errors.New("extracurricular has reached its capacity")
	ErrClubLimitReached     = errors.New("student already holds the maximum number of clubs")
	ErrMembershipNotFound   = errors.New("membership not found")
	ErrMembershipNotActive  = errors.New("membership is not active")
	ErrAlreadyMember        = errors.New("student is already an active member of this club")
	ErrMeetingNotFound      = errors.New("meeting not found")
	ErrMeetingExists        = errors.New("a meeting already exists for this club on this date")
	ErrNotAMember           = errors.New("student is not a member of this club")
	ErrActivityNotFound     = errors.New("activity not found")
	ErrAchievementNotFound  = errors.New("achievement not found")
	ErrInvalidParticipant   = errors.New("participant must reference exactly one of class, grade level or student")
	ErrInvalidInput         = errors.New("invalid input")
	ErrNoActiveAcademicYear = errors.New("no active academic year")
)

// AttendanceStatus is the local status vocabulary this module falls back
// to: reusing the tenant-configurable attendance_statuses policy was the
// goal, but that policy is only reachable through the attendance module's
// unexported loadStatusPolicy, so there is no exported reader to adapt
// over (see apps/api/internal/wiring for the pattern this would follow if
// one existed). This is deliberately the smallest fixed set, matching the
// letters already stored in extracurricular_attendance.status_code.
type AttendanceStatus string

const (
	StatusPresent AttendanceStatus = "H"
	StatusPermit  AttendanceStatus = "I"
	StatusSick    AttendanceStatus = "S"
	StatusAbsent  AttendanceStatus = "A"
)

func (s AttendanceStatus) Valid() bool {
	switch s {
	case StatusPresent, StatusPermit, StatusSick, StatusAbsent:
		return true
	}
	return false
}

// AttendanceStatusLabels drives the UI legend without a second source of
// truth living in the frontend.
var AttendanceStatusLabels = map[AttendanceStatus]string{
	StatusPresent: "Hadir",
	StatusPermit:  "Izin",
	StatusSick:    "Sakit",
	StatusAbsent:  "Alpha",
}

// Extracurricular is a club: a catalogue entry with a coach, an optional
// capacity, and an optional single weekly meeting slot.
type Extracurricular struct {
	ID             uuid.UUID
	TenantID       uuid.UUID
	AcademicYearID uuid.UUID
	Name           string
	Description    string
	CoachUserID    uuid.NullUUID
	Capacity       *int
	MeetingDay     *int16 // 0 = Sunday, matches time.Weekday
	MeetingStart   *string
	MeetingEnd     *string
	Location       string
	IsActive       bool
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// HasRoom reports whether one more active member fits under the club's
// configured capacity. A nil capacity means unlimited.
func (e Extracurricular) HasRoom(activeMemberCount int) bool {
	return e.Capacity == nil || activeMemberCount < *e.Capacity
}

type MembershipStatus string

const (
	MembershipActive MembershipStatus = "active"
	MembershipLeft   MembershipStatus = "left"
)

// Membership is one stint of a student in a club. A student who leaves
// and rejoins gets a new row, so ActiveDuringPeriod can tell separate
// stints apart instead of merging them into one long span.
type Membership struct {
	ID                uuid.UUID
	TenantID          uuid.UUID
	ExtracurricularID uuid.UUID
	StudentUserID     uuid.UUID
	JoinedOn          time.Time
	LeftOn            *time.Time
	Status            MembershipStatus
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

func (m Membership) IsActive() bool { return m.Status == MembershipActive }

// ActiveDuringPeriod reports whether this membership stint overlapped at
// all with [from, to]: joined on or before the period ends, and (still
// active, or left on or after the period starts). This is what a
// "who was a member during term X" report asks for -- it is not the same
// question as "is active right now".
func (m Membership) ActiveDuringPeriod(from, to time.Time) bool {
	if m.JoinedOn.After(to) {
		return false
	}
	if m.LeftOn == nil {
		return true
	}
	return !m.LeftOn.Before(from)
}

// MembershipLimitPolicy is the tenant-configured cap on how many clubs one
// student may hold at once, versioned like discipline's SP ladder.
type MembershipLimitPolicy struct {
	Version            int
	MaxClubsPerStudent int
}

// DefaultMembershipLimitPolicy matches what most schools already do
// informally: no hard cap. A tenant that wants one configures it
// explicitly via UpdateMembershipPolicy.
func DefaultMembershipLimitPolicy() MembershipLimitPolicy {
	return MembershipLimitPolicy{Version: 1, MaxClubsPerStudent: 0}
}

// Validate rejects a negative cap; zero means "no limit".
func (p MembershipLimitPolicy) Validate() error {
	if p.MaxClubsPerStudent < 0 {
		return ErrInvalidInput
	}
	return nil
}

// AllowsAnotherClub reports whether a student already holding
// currentClubCount active memberships may join one more.
func (p MembershipLimitPolicy) AllowsAnotherClub(currentClubCount int) bool {
	return p.MaxClubsPerStudent == 0 || currentClubCount < p.MaxClubsPerStudent
}

// Meeting is one scheduled session of a club, the unit attendance is
// recorded against.
type Meeting struct {
	ID                uuid.UUID
	TenantID          uuid.UUID
	ExtracurricularID uuid.UUID
	MeetingDate       time.Time
	Notes             string
	CreatedAt         time.Time
}

// AttendanceEntry is one student's recorded status for one meeting.
type AttendanceEntry struct {
	ID            uuid.UUID
	TenantID      uuid.UUID
	MeetingID     uuid.UUID
	StudentUserID uuid.UUID
	StatusCode    AttendanceStatus
	Notes         string
	RecordedBy    uuid.NullUUID
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

// ParticipantScope is the kind of audience one activity was set up for.
type ParticipantScope string

const (
	ScopeClass      ParticipantScope = "class"
	ScopeGradeLevel ParticipantScope = "grade_level"
	ScopeStudent    ParticipantScope = "student"
)

// Activity is a one-off school event, distinct from a recurring club.
type Activity struct {
	ID             uuid.UUID
	TenantID       uuid.UUID
	AcademicYearID uuid.UUID
	Name           string
	Description    string
	Location       string
	StartDate      time.Time
	EndDate        time.Time
	OrganiserID    uuid.NullUUID
	Participants   []Participant
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

func (a Activity) Validate() error {
	if a.Name == "" || a.EndDate.Before(a.StartDate) {
		return ErrInvalidInput
	}
	return nil
}

// Participant is one audience row for an activity: exactly one of the
// three references is set, mirroring the database CHECK constraint so the
// same rule cannot drift between the two layers.
type Participant struct {
	ID           uuid.UUID
	Scope        ParticipantScope
	ClassID      uuid.NullUUID
	GradeLevelID uuid.NullUUID
	StudentID    uuid.NullUUID
}

func (p Participant) Validate() error {
	set := 0
	if p.ClassID.Valid {
		set++
	}
	if p.GradeLevelID.Valid {
		set++
	}
	if p.StudentID.Valid {
		set++
	}
	if set != 1 {
		return ErrInvalidParticipant
	}
	return nil
}

// AchievementLevel is the competition tier a placing was won at.
type AchievementLevel string

const (
	LevelSchool        AchievementLevel = "school"
	LevelDistrict      AchievementLevel = "district"
	LevelCity          AchievementLevel = "city"
	LevelProvince      AchievementLevel = "province"
	LevelNational      AchievementLevel = "national"
	LevelInternational AchievementLevel = "international"
)

func (l AchievementLevel) Valid() bool {
	switch l {
	case LevelSchool, LevelDistrict, LevelCity, LevelProvince, LevelNational, LevelInternational:
		return true
	}
	return false
}

// Achievement is one competition result recorded for a student.
type Achievement struct {
	ID              uuid.UUID
	TenantID        uuid.UUID
	AcademicYearID  uuid.UUID
	StudentUserID   uuid.UUID
	CompetitionName string
	Level           AchievementLevel
	Placing         string
	AchievedOn      time.Time
	Notes           string
	CreatedBy       uuid.NullUUID
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

func (a Achievement) Validate() error {
	if a.CompetitionName == "" || a.Placing == "" || !a.Level.Valid() || a.AchievedOn.IsZero() {
		return ErrInvalidInput
	}
	return nil
}
