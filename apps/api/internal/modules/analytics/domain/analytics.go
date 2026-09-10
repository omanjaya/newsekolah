// Package domain holds the early-warning scoring rule: a pure function
// from a student's observed signals and a tenant policy to a risk level
// and the reasons that produced it. It imports nothing but stdlib, per
// docs/03-layered-architecture.md section 1, so it is testable without a
// database and safe to run inside the recompute job for every student in
// a tenant without any I/O.
package domain

import (
	"errors"
	"sort"
)

var ErrInvalidPolicy = errors.New("invalid analytics policy")

// Level is how urgently a student's signals call for a person to act.
// It is deliberately not named for the student ("struggling", "problem
// student"): it names the situation, and a level with no reasons attached
// is never rendered on its own.
type Level string

const (
	LevelNone   Level = "none"
	LevelWatch  Level = "watch"
	LevelAtRisk Level = "at_risk"
)

func (l Level) Valid() bool {
	switch l {
	case LevelNone, LevelWatch, LevelAtRisk:
		return true
	}
	return false
}

// ReasonCode names one observation the scorer used, never a judgement
// about the student. The transport/web layer maps it and its Params to
// i18n text such as "absen 7 dari 20 hari sekolah terakhir" -- the wording
// lives there, not in domain.
type ReasonCode string

const (
	ReasonAttendanceWatch    ReasonCode = "attendance_absence_watch"
	ReasonAttendanceAtRisk   ReasonCode = "attendance_absence_at_risk"
	ReasonDisciplineWatch    ReasonCode = "discipline_points_watch"
	ReasonDisciplineAtRisk   ReasonCode = "discipline_points_at_risk"
	ReasonWarningLetterWatch ReasonCode = "warning_letter_watch"
	ReasonWarningLetterRisk  ReasonCode = "warning_letter_at_risk"
	ReasonGradeDropWatch     ReasonCode = "grade_drop_watch"
	ReasonGradeDropAtRisk    ReasonCode = "grade_drop_at_risk"
)

// Reason is one fact that contributed to the score: a stable code plus the
// exact numbers observed, so the detail screen can render "absent 7 of the
// last 20 school days" instead of a summary word.
type Reason struct {
	Code   ReasonCode     `json:"code"`
	Weight int            `json:"weight"`
	Params map[string]any `json:"params"`
}

// Signals is everything the scorer knows about one student. A zero value
// for a Has* field means the platform has no basis for that signal this
// term (e.g. no attendance recorded yet, or no previous term to compare
// against) -- the scorer skips that factor entirely rather than treating
// "no data" as "no risk" or inventing a number.
type Signals struct {
	HasAttendance  bool
	ConsideredDays int // school days with a recorded status in the window
	AbsentDays     int

	ActiveViolationCount int
	DisciplinePoints     int
	WarningLetterCount   int

	HasGradeTrend   bool
	PreviousAverage float64
	CurrentAverage  float64
}

// Policy is the tenant-tunable configuration of the scorer: how many
// school days the attendance signal looks back over, the rate/point/count
// thresholds that separate "watch" from "at risk", how much each signal
// counts toward the total score, and the two score cutoffs that decide
// the level. Every school starts on DefaultPolicy; a school with its own
// rules (docs/12-roadmap.md Fase 5) overrides it via the tenant policy
// endpoint.
type Policy struct {
	Version int `json:"version"`

	WindowDays int `json:"window_days"`

	AttendanceWatchRate  float64 `json:"attendance_watch_rate"`
	AttendanceAtRiskRate float64 `json:"attendance_at_risk_rate"`

	DisciplineWatchPoints  int `json:"discipline_watch_points"`
	DisciplineAtRiskPoints int `json:"discipline_at_risk_points"`

	WarningLetterWatchCount  int `json:"warning_letter_watch_count"`
	WarningLetterAtRiskCount int `json:"warning_letter_at_risk_count"`

	GradeDropWatchPoints  float64 `json:"grade_drop_watch_points"`
	GradeDropAtRiskPoints float64 `json:"grade_drop_at_risk_points"`

	AttendanceWeight int `json:"attendance_weight"`
	DisciplineWeight int `json:"discipline_weight"`
	WarningWeight    int `json:"warning_weight"`
	GradeWeight      int `json:"grade_weight"`

	WatchScore  int `json:"watch_score"`
	AtRiskScore int `json:"at_risk_score"`
}

// DefaultPolicy is what every tenant starts on until it configures its
// own: roughly, missing a fifth of school days, crossing the first
// warning-letter threshold, or losing 10+ report-score points term over
// term puts a student on watch; the "at risk" cutoffs are set at levels
// that already independently warrant action (a warning letter has been
// issued, or a quarter of school days missed).
func DefaultPolicy() Policy {
	return Policy{
		Version:    1,
		WindowDays: 20,

		AttendanceWatchRate:  0.15,
		AttendanceAtRiskRate: 0.25,

		DisciplineWatchPoints:  25,
		DisciplineAtRiskPoints: 50,

		WarningLetterWatchCount:  1,
		WarningLetterAtRiskCount: 2,

		GradeDropWatchPoints:  10,
		GradeDropAtRiskPoints: 20,

		AttendanceWeight: 40,
		DisciplineWeight: 30,
		WarningWeight:    15,
		GradeWeight:      15,

		WatchScore:  40,
		AtRiskScore: 70,
	}
}

// Validate rejects a policy the scorer cannot run: non-positive windows or
// weights, watch thresholds at or past their at-risk counterpart, or score
// cutoffs that are not strictly increasing.
func (p Policy) Validate() error {
	if p.WindowDays <= 0 {
		return ErrInvalidPolicy
	}
	if err := p.validateThresholds(); err != nil {
		return err
	}
	if p.AttendanceWeight <= 0 || p.DisciplineWeight <= 0 || p.WarningWeight <= 0 || p.GradeWeight <= 0 {
		return ErrInvalidPolicy
	}
	if p.WatchScore <= 0 || p.AtRiskScore <= p.WatchScore {
		return ErrInvalidPolicy
	}
	return nil
}

// validateThresholds checks that every signal's watch threshold is strictly
// below its at-risk threshold, split out from Validate to keep both under
// docs/04-clean-code.md section 1's cyclomatic-complexity limit.
func (p Policy) validateThresholds() error {
	switch {
	case p.AttendanceWatchRate <= 0 || p.AttendanceAtRiskRate <= p.AttendanceWatchRate:
		return ErrInvalidPolicy
	case p.DisciplineWatchPoints <= 0 || p.DisciplineAtRiskPoints <= p.DisciplineWatchPoints:
		return ErrInvalidPolicy
	case p.WarningLetterWatchCount <= 0 || p.WarningLetterAtRiskCount <= p.WarningLetterWatchCount:
		return ErrInvalidPolicy
	case p.GradeDropWatchPoints <= 0 || p.GradeDropAtRiskPoints <= p.GradeDropWatchPoints:
		return ErrInvalidPolicy
	}
	return nil
}

// Result is the scorer's verdict for one student.
type Result struct {
	Level   Level    `json:"level"`
	Score   int      `json:"score"`
	Reasons []Reason `json:"reasons"`
}

// Score is the pure rule at the centre of this module: each signal that
// crosses a policy threshold contributes half or all of its weight to the
// total (half at "watch", all at "at risk") and emits the Reason that
// explains why, then the total is compared against the policy's two score
// cutoffs. A signal the platform has no data for contributes nothing and
// produces no reason -- see Signals' doc comment.
func Score(s Signals, p Policy) Result {
	var reasons []Reason
	total := 0

	if s.HasAttendance && s.ConsideredDays > 0 {
		rate := float64(s.AbsentDays) / float64(s.ConsideredDays)
		params := map[string]any{"absent_days": s.AbsentDays, "considered_days": s.ConsideredDays}
		switch {
		case rate >= p.AttendanceAtRiskRate:
			total += p.AttendanceWeight
			reasons = append(reasons, Reason{Code: ReasonAttendanceAtRisk, Weight: p.AttendanceWeight, Params: params})
		case rate >= p.AttendanceWatchRate:
			w := p.AttendanceWeight / 2
			total += w
			reasons = append(reasons, Reason{Code: ReasonAttendanceWatch, Weight: w, Params: params})
		}
	}

	{
		params := map[string]any{"points": s.DisciplinePoints, "active_violations": s.ActiveViolationCount}
		switch {
		case s.DisciplinePoints >= p.DisciplineAtRiskPoints:
			total += p.DisciplineWeight
			reasons = append(reasons, Reason{Code: ReasonDisciplineAtRisk, Weight: p.DisciplineWeight, Params: params})
		case s.DisciplinePoints >= p.DisciplineWatchPoints:
			w := p.DisciplineWeight / 2
			total += w
			reasons = append(reasons, Reason{Code: ReasonDisciplineWatch, Weight: w, Params: params})
		}
	}

	{
		params := map[string]any{"warning_letter_count": s.WarningLetterCount}
		switch {
		case s.WarningLetterCount >= p.WarningLetterAtRiskCount:
			total += p.WarningWeight
			reasons = append(reasons, Reason{Code: ReasonWarningLetterRisk, Weight: p.WarningWeight, Params: params})
		case s.WarningLetterCount >= p.WarningLetterWatchCount:
			w := p.WarningWeight / 2
			total += w
			reasons = append(reasons, Reason{Code: ReasonWarningLetterWatch, Weight: w, Params: params})
		}
	}

	if s.HasGradeTrend {
		drop := s.PreviousAverage - s.CurrentAverage
		params := map[string]any{"previous_average": s.PreviousAverage, "current_average": s.CurrentAverage}
		switch {
		case drop >= p.GradeDropAtRiskPoints:
			total += p.GradeWeight
			reasons = append(reasons, Reason{Code: ReasonGradeDropAtRisk, Weight: p.GradeWeight, Params: params})
		case drop >= p.GradeDropWatchPoints:
			w := p.GradeWeight / 2
			total += w
			reasons = append(reasons, Reason{Code: ReasonGradeDropWatch, Weight: w, Params: params})
		}
	}

	sort.SliceStable(reasons, func(i, j int) bool { return reasons[i].Weight > reasons[j].Weight })

	return Result{Level: levelFor(total, p), Score: total, Reasons: reasons}
}

func levelFor(score int, p Policy) Level {
	switch {
	case score >= p.AtRiskScore:
		return LevelAtRisk
	case score >= p.WatchScore:
		return LevelWatch
	default:
		return LevelNone
	}
}
