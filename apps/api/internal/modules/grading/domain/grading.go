// Package domain holds the grading rules: weighted component averages, the
// report score with its "increase from the previous term" adjustment, and
// the star balance that can never go negative.
package domain

import (
	"errors"
	"math"
	"time"

	"github.com/google/uuid"
)

var (
	ErrComponentNotFound    = errors.New("assessment component not found")
	ErrComponentCodeExists  = errors.New("assessment component code already exists")
	ErrNotTeachingThisClass = errors.New("not the teacher of this class and subject")
	ErrGradesNotPublished   = errors.New("grades are not published yet")
	ErrStarBalanceNegative  = errors.New("star balance cannot go below zero")
	ErrNoActiveTerm         = errors.New("no active term")
	ErrNoActiveAcademicYear = errors.New("no active academic year")
	ErrInvalidInput         = errors.New("invalid input")
	ErrScoreOutOfRange      = errors.New("score outside the grading scale")
	ErrNoGradableSubjects   = errors.New("class has no subjects to export")
)

type ComponentKind string

const (
	KindFormative ComponentKind = "formative"
	KindSummative ComponentKind = "summative"
	KindProject   ComponentKind = "project"
	KindPractical ComponentKind = "practical"
	KindAttitude  ComponentKind = "attitude"
	KindOther     ComponentKind = "other"
)

func (k ComponentKind) Valid() bool {
	switch k {
	case KindFormative, KindSummative, KindProject, KindPractical, KindAttitude, KindOther:
		return true
	}
	return false
}

type Component struct {
	ID             uuid.UUID
	TenantID       uuid.UUID
	AcademicYearID uuid.UUID
	TermID         uuid.UUID
	TeacherUserID  uuid.UUID
	ClassID        uuid.UUID
	SubjectID      uuid.UUID
	Code           string
	Kind           ComponentKind
	Description    string
	KKTP           *float64
	Weight         float64
	Sequence       int
}

type Grade struct {
	ComponentID   uuid.UUID
	StudentUserID uuid.UUID
	Score         float64
	UpdatedAt     time.Time
}

// Scale is the tenant's grading scale (docs/02 section 4.3 "grading.scale").
type Scale struct {
	Version      int     `json:"version"`
	Min          float64 `json:"min"`
	Max          float64 `json:"max"`
	IncreaseMax  float64 `json:"report_increase_max"`
	DefaultKKTP  float64 `json:"default_kktp"`
	RoundDecimal int     `json:"round_decimal"`
}

func DefaultScale() Scale {
	return Scale{Version: 1, Min: 0, Max: 100, IncreaseMax: 5, DefaultKKTP: 70, RoundDecimal: 2}
}

func (s Scale) Validate() error {
	if s.Max <= s.Min || s.IncreaseMax < 0 || s.RoundDecimal < 0 || s.RoundDecimal > 4 {
		return ErrInvalidInput
	}
	return nil
}

func (s Scale) InRange(score float64) bool { return score >= s.Min && score <= s.Max }

func (s Scale) Round(value float64) float64 {
	factor := math.Pow(10, float64(s.RoundDecimal))
	return math.Round(value*factor) / factor
}

func (s Scale) Clamp(value float64) float64 {
	return math.Min(math.Max(value, s.Min), s.Max)
}

// WeightedAverage is the term score for one subject: every graded
// component counts by its weight; ungraded components are skipped rather
// than counted as zero, so a mid-term average reflects what exists.
func WeightedAverage(components []Component, grades map[uuid.UUID]float64) (float64, bool) {
	var sum, weight float64
	for _, c := range components {
		score, ok := grades[c.ID]
		if !ok {
			continue
		}
		sum += score * c.Weight
		weight += c.Weight
	}
	if weight == 0 {
		return 0, false
	}
	return sum / weight, true
}

// GradeRange raises a report score by IncreaseAmount when the raw average
// falls inside [MinScore, MaxScore]. Ranges are optional per subject or
// teacher; the first match wins.
type GradeRange struct {
	ID             uuid.UUID
	SubjectID      uuid.NullUUID
	TeacherUserID  uuid.NullUUID
	MinScore       float64
	MaxScore       float64
	IncreaseAmount float64
}

// ReportScore computes the final report score: the weighted average,
// raised by a matching range (capped by the scale's IncreaseMax), never
// below the previous term's score when one exists, and clamped to the scale.
func ReportScore(scale Scale, raw float64, previous *float64, ranges []GradeRange) float64 {
	final := raw
	for _, r := range ranges {
		if raw >= r.MinScore && raw <= r.MaxScore {
			final += math.Min(r.IncreaseAmount, scale.IncreaseMax)
			break
		}
	}
	if previous != nil && *previous > final {
		final = *previous
	}
	return scale.Round(scale.Clamp(final))
}

type StarEvent struct {
	ID               uuid.UUID
	TenantID         uuid.UUID
	AcademicYearID   uuid.UUID
	ClassID          uuid.UUID
	SubjectID        uuid.NullUUID
	StudentUserID    uuid.UUID
	TeacherUserID    uuid.UUID
	Delta            int
	Note             string
	VisibleToStudent bool
	CreatedAt        time.Time
}

// ApplyStar reports the balance after delta, refusing to go negative
// (docs/06 section 9: "constraint saldo >= 0 ditegakkan service").
func ApplyStar(balance, delta int) (int, error) {
	if delta == 0 {
		return balance, ErrInvalidInput
	}
	next := balance + delta
	if next < 0 {
		return balance, ErrStarBalanceNegative
	}
	return next, nil
}
