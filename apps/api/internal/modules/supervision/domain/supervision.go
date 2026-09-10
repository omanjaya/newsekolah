// Package domain holds the supervision module's entities and rules: an
// instrument's scale, and the completed observation an instrument scores
// against it. Nothing here imports pgx, chi, or gen/*, per
// docs/03-layered-architecture.md section 1.
package domain

import (
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
)

var (
	ErrCycleNotFound        = errors.New("supervision cycle not found")
	ErrInstrumentInvalid    = errors.New("supervision instrument invalid")
	ErrScheduledNotFound    = errors.New("scheduled observation not found")
	ErrScheduledAlreadyDone = errors.New("scheduled observation already completed")
	ErrObservationNotFound  = errors.New("observation not found")
	ErrObservationForbidden = errors.New("observation not visible to this user")
	ErrScoreCountMismatch   = errors.New("scores must cover every criterion exactly once")
	ErrScoreOutOfRange      = errors.New("score outside the instrument's scale")
	ErrLessonNotResolved    = errors.New("scheduled lesson could not be resolved")
	ErrNoActiveAcademicYear = errors.New("no active academic year")
	ErrInvalidInput         = errors.New("invalid input")
	ErrModuleDisabled       = errors.New("supervision module is disabled for this tenant")
)

// Criterion is one named thing an observer scores during a lesson
// observation, e.g. "Penguasaan materi" or "Pengelolaan kelas".
type Criterion struct {
	Key  string `json:"key"`
	Name string `json:"name"`
}

// Instrument is a named set of criteria, each scored on the same scale
// the school defines (e.g. 1 to 4). A cycle keeps one instrument for the
// whole academic year so scores stay comparable across observations.
type Instrument struct {
	Version  int         `json:"version"`
	Name     string      `json:"name"`
	ScaleMin int         `json:"scale_min"`
	ScaleMax int         `json:"scale_max"`
	Criteria []Criterion `json:"criteria"`
}

func (i Instrument) Validate() error {
	if strings.TrimSpace(i.Name) == "" || len(i.Criteria) == 0 {
		return ErrInstrumentInvalid
	}
	if i.ScaleMin >= i.ScaleMax {
		return ErrInstrumentInvalid
	}
	seen := make(map[string]bool, len(i.Criteria))
	for _, c := range i.Criteria {
		key := strings.TrimSpace(c.Key)
		if key == "" || strings.TrimSpace(c.Name) == "" {
			return ErrInstrumentInvalid
		}
		if seen[key] {
			return ErrInstrumentInvalid
		}
		seen[key] = true
	}
	return nil
}

// InRange reports whether score is a valid mark on this instrument's scale.
func (i Instrument) InRange(score int) bool {
	return score >= i.ScaleMin && score <= i.ScaleMax
}

// CriterionScore is one criterion's mark within a completed observation.
type CriterionScore struct {
	CriterionKey string `json:"criterion_key"`
	Score        int    `json:"score"`
}

// ValidateScores checks the invariant a completed observation must hold
// against its cycle's instrument: exactly one score per criterion, each
// within the instrument's scale, no unknown criterion keys.
func (i Instrument) ValidateScores(scores []CriterionScore) error {
	if len(scores) != len(i.Criteria) {
		return ErrScoreCountMismatch
	}
	known := make(map[string]bool, len(i.Criteria))
	for _, c := range i.Criteria {
		known[c.Key] = true
	}
	seen := make(map[string]bool, len(scores))
	for _, s := range scores {
		if !known[s.CriterionKey] || seen[s.CriterionKey] {
			return ErrScoreCountMismatch
		}
		seen[s.CriterionKey] = true
		if !i.InRange(s.Score) {
			return ErrScoreOutOfRange
		}
	}
	return nil
}

// Average reports the mean of scores, for a per-teacher report; the
// caller must have already validated scores against an instrument.
func Average(scores []CriterionScore) float64 {
	if len(scores) == 0 {
		return 0
	}
	sum := 0
	for _, s := range scores {
		sum += s.Score
	}
	return float64(sum) / float64(len(scores))
}

// SupervisionCycle is one academic year's supervision program: leadership
// observing teachers' lessons against one instrument.
type SupervisionCycle struct {
	ID             uuid.UUID
	TenantID       uuid.UUID
	AcademicYearID uuid.UUID
	Name           string
	Instrument     Instrument
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

func (c SupervisionCycle) Validate() error {
	if strings.TrimSpace(c.Name) == "" {
		return ErrInvalidInput
	}
	return c.Instrument.Validate()
}

// ScheduledObservation is a planned visit to a specific lesson, resolved
// through an adapter over the scheduling module rather than mentoring...
// supervision holding its own copy of what class or subject the schedule
// covers.
type ScheduledObservation struct {
	ID             uuid.UUID
	TenantID       uuid.UUID
	CycleID        uuid.UUID
	ScheduleID     uuid.UUID
	LessonDate     time.Time
	TeacherUserID  uuid.UUID
	ObserverUserID uuid.UUID
	CreatedAt      time.Time
}

func (s ScheduledObservation) Validate() error {
	if s.CycleID == uuid.Nil || s.ScheduleID == uuid.Nil || s.LessonDate.IsZero() {
		return ErrInvalidInput
	}
	if s.TeacherUserID == uuid.Nil || s.ObserverUserID == uuid.Nil {
		return ErrInvalidInput
	}
	return nil
}

// ObservationReader is what the service resolves about the caller before
// applying the read rule: the observer who wrote it and leadership always
// read it; the observed teacher always reads their own, per the brief.
type ObservationReader struct {
	IsObserver   bool
	IsLeadership bool
	IsObserved   bool
}

// Observation is the completed record of a scheduled visit: scores against
// the cycle's instrument, the observer's notes, the teacher's response,
// and the agreed follow-up.
type Observation struct {
	ID              uuid.UUID
	TenantID        uuid.UUID
	ScheduledID     uuid.UUID
	CycleID         uuid.UUID
	TeacherUserID   uuid.UUID
	ObserverUserID  uuid.UUID
	Scores          []CriterionScore
	ObserverNotes   string
	TeacherResponse string
	AgreedFollowUp  string
	ObservedAt      time.Time
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

func (o Observation) VisibleTo(r ObservationReader) bool {
	return r.IsObserver || r.IsLeadership || r.IsObserved
}

func (o Observation) Validate() error {
	if o.ScheduledID == uuid.Nil || strings.TrimSpace(o.ObserverNotes) == "" {
		return ErrInvalidInput
	}
	return nil
}
