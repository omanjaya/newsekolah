// Package domain holds the grading rules: weighted component averages, the
// report score with its "increase from the previous term" adjustment, the
// star balance that can never go negative, and the assessment-component
// validation the old app enforced before every insert or update.
package domain

import (
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/google/uuid"
)

var (
	ErrComponentNotFound    = errors.New("assessment component not found")
	ErrComponentCodeExists  = errors.New("assessment component code already exists")
	ErrComponentHasGrades   = errors.New("assessment component already has grades and cannot be deleted")
	ErrNotTeachingThisClass = errors.New("not the teacher of this class and subject")
	ErrGradesNotPublished   = errors.New("grades are not published yet")
	ErrStarBalanceNegative  = errors.New("star balance cannot go below zero")
	ErrNoActiveTerm         = errors.New("no active term")
	ErrNoActiveAcademicYear = errors.New("no active academic year")
	ErrInvalidInput         = errors.New("invalid input")
	ErrScoreOutOfRange      = errors.New("score outside the grading scale")
	ErrNoGradableSubjects   = errors.New("class has no subjects to export")
	ErrStudentNotInClass    = errors.New("student is not an active member of this class")
	ErrGradeRangeOverlap    = errors.New("grade ranges overlap")
	ErrTPExportCodeExists   = errors.New("TP export code already used in this class and subject")
	ErrTPKindNotEligible    = errors.New("component kind is not eligible for TP mapping")
	ErrTPMappingNotFound    = errors.New("TP mapping not found")
	ErrModuleDisabled       = errors.New("grading module is disabled for this tenant")
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

// ValidateComponent enforces the assessment-component rules the old app
// checked before every insert or update (grading.go:153-175): a non-empty
// code no longer than 32 characters, a description capped at 500, a valid
// kind, a weight between 0 and 100, and a KKTP between 0 and 100 when the
// teacher sets one. code and description are expected already trimmed (and
// code uppercased) by the caller, matching the old app's normalization.
func ValidateComponent(code, description string, kind ComponentKind, weight float64, kktp *float64) error {
	if code == "" || len(code) > 32 {
		return ErrInvalidInput
	}
	if !kind.Valid() {
		return ErrInvalidInput
	}
	if len(description) > 500 {
		return ErrInvalidInput
	}
	if weight < 0 || weight > 100 {
		return ErrInvalidInput
	}
	if kktp != nil && (*kktp < 0 || *kktp > 100) {
		return ErrInvalidInput
	}
	return nil
}

type Grade struct {
	ComponentID   uuid.UUID
	StudentUserID uuid.UUID
	Score         float64
	UpdatedAt     time.Time
}

// Scale is the tenant's grading scale (docs/02 section 4.3 "grading.scale").
// TPKind is the extra component kind (beyond formative) this tenant treats
// as eligible for TP export mapping; empty means only formative qualifies.
type Scale struct {
	Version      int           `json:"version"`
	Min          float64       `json:"min"`
	Max          float64       `json:"max"`
	IncreaseMax  float64       `json:"report_increase_max"`
	DefaultKKTP  float64       `json:"default_kktp"`
	RoundDecimal int           `json:"round_decimal"`
	TPKind       ComponentKind `json:"tp_kind,omitempty"`
}

func DefaultScale() Scale {
	return Scale{Version: 1, Min: 0, Max: 100, IncreaseMax: 5, DefaultKKTP: 70, RoundDecimal: 2}
}

func (s Scale) Validate() error {
	if s.Max <= s.Min || s.IncreaseMax < 0 || s.RoundDecimal < 0 || s.RoundDecimal > 4 {
		return ErrInvalidInput
	}
	if s.TPKind != "" && !s.TPKind.Valid() {
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

// IsTPEligible is the eligibility rule for e-Rapor TP mapping: the
// tenant's own "formative" components, plus whatever second kind the
// tenant configured as its TP kind (schools whose curriculum maps TP to a
// different component kind than formative).
func (s Scale) IsTPEligible(kind ComponentKind) bool {
	return kind == KindFormative || (s.TPKind != "" && kind == s.TPKind)
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

// WeightedKKTPAverage is final_kktp (grading.go:394-419): the same
// weighted average as WeightedAverage, but over each scored component's
// KKTP rather than its score, and skipping components that carry no KKTP
// at all.
func WeightedKKTPAverage(components []Component, grades map[uuid.UUID]float64) (float64, bool) {
	var sum, weight float64
	for _, c := range components {
		if c.KKTP == nil {
			continue
		}
		if _, ok := grades[c.ID]; !ok {
			continue
		}
		sum += *c.KKTP * c.Weight
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

// ValidateGradeRanges enforces the old app's "aturan nilai rapor" rules
// (grading_extended.go:96-109): every range must sit inside the tenant's
// scale, its increase must be 0 to 10 (or the scale's own increase cap
// when that is set higher), and no two ranges in the same batch may
// overlap.
func ValidateGradeRanges(scale Scale, ranges []GradeRange) error {
	maxIncrease := scale.IncreaseMax
	if maxIncrease < 10 {
		maxIncrease = 10
	}
	for i, r := range ranges {
		if r.MinScore < scale.Min || r.MaxScore > scale.Max || r.MinScore > r.MaxScore {
			return ErrInvalidInput
		}
		if r.IncreaseAmount < 0 || r.IncreaseAmount > maxIncrease {
			return ErrInvalidInput
		}
		for j := 0; j < i; j++ {
			o := ranges[j]
			if r.MinScore <= o.MaxScore && r.MaxScore >= o.MinScore {
				return ErrGradeRangeOverlap
			}
		}
	}
	return nil
}

// ReportWarning flags a computed report score the teacher should look at
// again before publishing (grading_extended.go:317-326).
type ReportWarning string

const (
	ReportWarningNone   ReportWarning = ""
	ReportWarningNotice ReportWarning = "warning"
	ReportWarningDanger ReportWarning = "danger"
)

// Message renders the warning the way the old app's export and analysis
// screens phrased it.
func (w ReportWarning) Message(previous *float64, final float64) string {
	switch w {
	case ReportWarningDanger:
		drop := 0.0
		if previous != nil {
			drop = *previous - final
		}
		return fmt.Sprintf("Turun %.2f poin dari nilai sebelumnya", drop)
	case ReportWarningNotice:
		return "Selisih lebih dari 10 poin dari nilai murni"
	default:
		return "OK"
	}
}

// ReportScoreResult is one student's report score computation: the
// automatic value the range rule produces, the final value after a manual
// override, and any warning the teacher should see.
type ReportScoreResult struct {
	Automatic float64
	Final     float64
	Warning   ReportWarning
}

// ComputeReportScore restores the old app's report-score rule
// (grading_extended.go:294-326): a matching range only raises the score
// when the student already has a previous-term score above zero -- a
// range is a promotion floor carried from last term, not a first-term
// bonus -- and when it applies, the raise adds to the previous score
// rather than to the raw average. Without a positive previous score the
// automatic value is simply the raw average. A manual override always
// wins as the final value; the automatic value survives alongside it so
// clearing the override later restores it without a recompute. Warnings
// mirror the old app: "danger" when the final score drops below the
// previous term, "warning" when it strays more than 10 points from the
// raw average.
func ComputeReportScore(scale Scale, raw float64, previous, manual *float64, ranges []GradeRange) ReportScoreResult {
	automatic := raw
	if previous != nil && *previous > 0 {
		for _, r := range ranges {
			if raw >= r.MinScore && raw <= r.MaxScore {
				automatic = *previous + math.Min(r.IncreaseAmount, scale.IncreaseMax)
				break
			}
		}
	}
	automatic = scale.Round(scale.Clamp(automatic))

	final := automatic
	if manual != nil {
		final = scale.Round(scale.Clamp(*manual))
	}

	warning := ReportWarningNone
	switch {
	case previous != nil && final < *previous:
		warning = ReportWarningDanger
	case math.Abs(final-raw) > 10:
		warning = ReportWarningNotice
	}
	return ReportScoreResult{Automatic: automatic, Final: final, Warning: warning}
}

// TPResult is the T|R mark the e-Rapor legacy sheet prints for one mapped
// TP component (grading_extended.go:412-420): T when the student's score
// falls inside the mapping's "tuntas" range, R otherwise, blank when the
// student has no score for that component yet.
func TPResult(score *float64, tMin, tMax float64) string {
	if score == nil {
		return ""
	}
	if *score >= tMin && *score <= tMax {
		return "T"
	}
	return "R"
}

// TPMapping is one component's export code and pass/fail thresholds for
// the e-Rapor legacy sheet (report_tp_mappings).
type TPMapping struct {
	ID          uuid.UUID
	ComponentID uuid.UUID
	ExportCode  string
	RMin        float64
	RMax        float64
	TMin        float64
	TMax        float64
}

// ValidateTPMapping enforces the old app's mapping rules
// (grading_extended.go:221): the export code is required (the caller
// normalizes it to upper case first), and both the R and T ranges must be
// valid sub-ranges of the tenant's scale.
func ValidateTPMapping(scale Scale, m TPMapping) error {
	if m.ExportCode == "" || len(m.ExportCode) > 32 {
		return ErrInvalidInput
	}
	if m.RMin < scale.Min || m.RMax > scale.Max || m.RMin > m.RMax {
		return ErrInvalidInput
	}
	if m.TMin < scale.Min || m.TMax > scale.Max || m.TMin > m.TMax {
		return ErrInvalidInput
	}
	return nil
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

// ValidateStar enforces the old app's star rules (grading_extended.go:552,
// 585): the amount (the delta's absolute value) is 1 to 999, and a note
// is at most 255 characters.
func ValidateStar(delta int, note string) error {
	amount := delta
	if amount < 0 {
		amount = -amount
	}
	if amount < 1 || amount > 999 {
		return ErrInvalidInput
	}
	if len(note) > 255 {
		return ErrInvalidInput
	}
	return nil
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
