package service

import (
	"context"
	"sort"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics/domain"
)

// This file pins what the early-warning recompute produces for a
// representative fixture, independent of how the signals are read from the
// attendance, discipline and grading modules. The same fixture and the
// same golden table must hold for the original per-student read path and
// for the tenant-level batch path that replaced it.

// charStudent describes one fixture student's raw inputs in the owning
// modules' terms.
type charStudent struct {
	name string
	// absentDays are the day-of-month numbers (of every month) on which the
	// attendance module reports "absent" for a weekday; otherwise a weekday
	// is "H" and a weekend day is "NONE", the way attendance's calendar
	// reports them.
	absentDays map[int]bool
	// attendanceFails makes the attendance read fail for the student.
	attendanceFails bool

	violations, points, letters int
	disciplineFails             bool

	trendAvailable   bool
	previous, latest float64
	gradingFails     bool
}

var charNow = time.Date(2026, time.March, 15, 6, 0, 0, 0, time.UTC)

func charFixture() []charStudent {
	six := map[int]bool{12: true, 13: true, 16: true, 17: true, 18: true, 19: true}
	return []charStudent{
		{name: "clean"},
		{name: "attendance-watch", absentDays: map[int]bool{12: true, 13: true, 16: true}},
		{name: "attendance-at-risk", absentDays: six},
		{name: "attendance-unavailable", attendanceFails: true, points: 30, violations: 2},
		{name: "discipline-watch", violations: 3, points: 25},
		{name: "discipline-at-risk", violations: 6, points: 50},
		{name: "warning-watch", letters: 1},
		{name: "warning-at-risk", letters: 2},
		{name: "grade-watch", trendAvailable: true, previous: 80, latest: 70},
		{name: "grade-at-risk", trendAvailable: true, previous: 85.5, latest: 60.25},
		{name: "grade-no-drop", trendAvailable: true, previous: 70, latest: 90},
		{name: "grade-unavailable", trendAvailable: false, previous: 90, latest: 10},
		{name: "everything", absentDays: six, violations: 8, points: 80, letters: 3, trendAvailable: true, previous: 90, latest: 50},
		{name: "mixed-sum", absentDays: map[int]bool{12: true, 13: true, 16: true}, points: 30, violations: 2, letters: 1},
		{name: "discipline-reader-fails", points: 90, violations: 9, letters: 3, disciplineFails: true},
		{name: "grading-reader-fails", gradingFails: true, trendAvailable: true, previous: 90, latest: 10},
	}
}

func charIDFor(name string) uuid.UUID { return uuid.NewSHA1(uuid.NameSpaceOID, []byte(name)) }

func charByID(students []charStudent) map[uuid.UUID]charStudent {
	out := make(map[uuid.UUID]charStudent, len(students))
	for _, s := range students {
		out[charIDFor(s.name)] = s
	}
	return out
}

// charDay is the status the attendance module's calendar reports for the
// student on date.
func charDay(s charStudent, date time.Time) string {
	if date.Weekday() == time.Saturday || date.Weekday() == time.Sunday {
		return "NONE"
	}
	if s.absentDays[date.Day()] {
		return "absent"
	}
	return "H"
}

// charCase is one golden entry: the policy it ran under and the student.
type charCase struct{ policy, student string }

// charGolden is the pinned output of the recompute for charFixture at
// charNow. The signals and score were captured from the per-student path
// before it was replaced, then reviewed by hand against the policy.
var charGolden = map[charCase]charOutcome{}

type charOutcome struct {
	Signals domain.Signals
	Level   domain.Level
	Score   int
	Reasons []domain.ReasonCode
}

func charPolicies() map[string]domain.Policy {
	long := domain.DefaultPolicy()
	long.WindowDays = 45
	return map[string]domain.Policy{"default": domain.DefaultPolicy(), "window45": long}
}

func TestRecomputeCharacterization(t *testing.T) {
	students := charFixture()
	var names []string
	for name := range charPolicies() {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, policyName := range names {
		policy := charPolicies()[policyName]
		signalsByStudent := charSignals(t, students, policy, charNow)
		for _, student := range students {
			t.Run(policyName+"/"+student.name, func(t *testing.T) {
				signals := signalsByStudent[charIDFor(student.name)]
				result := domain.Score(signals, policy)
				got := charOutcome{Signals: signals, Level: result.Level, Score: result.Score}
				for _, r := range result.Reasons {
					got.Reasons = append(got.Reasons, r.Code)
				}
				want, ok := charGolden[charCase{policyName, student.name}]
				require.True(t, ok, "missing golden entry:\n{%q, %q}: %#v,", policyName, student.name, got)
				require.Equal(t, want, got, "golden mismatch:\n{%q, %q}: %#v,", policyName, student.name, got)
			})
		}
	}
}

// charAttendance, charDiscipline and charGrading implement the batch reader
// ports over the fixture. A student whose owning module fails to answer for
// them is simply left out of the answer, which is how the original
// per-student reads degraded that student's signal.
type charAttendance struct{ byID map[uuid.UUID]charStudent }

func (a charAttendance) DayStatuses(_ context.Context, _ uuid.UUID, studentIDs []uuid.UUID, dates []time.Time) ([]StudentDayStatus, error) {
	var out []StudentDayStatus
	for _, id := range studentIDs {
		s := a.byID[id]
		if s.attendanceFails {
			continue
		}
		for _, d := range dates {
			out = append(out, StudentDayStatus{StudentUserID: id, Date: d, StatusCode: charDay(s, d)})
		}
	}
	return out, nil
}

func (charAttendance) TodaySubmittedCount(context.Context, uuid.UUID) (int, int, error) {
	return 0, 0, nil
}

type charDiscipline struct{ byID map[uuid.UUID]charStudent }

func (d charDiscipline) StudentSummaries(_ context.Context, _ uuid.UUID, studentIDs []uuid.UUID) (map[uuid.UUID]DisciplineSummary, error) {
	out := map[uuid.UUID]DisciplineSummary{}
	for _, id := range studentIDs {
		if s := d.byID[id]; !s.disciplineFails {
			out[id] = DisciplineSummary{ActiveViolationCount: s.violations, TotalPoints: s.points, WarningLetterCount: s.letters}
		}
	}
	return out, nil
}

type charGrading struct{ byID map[uuid.UUID]charStudent }

func (g charGrading) ReportTrends(_ context.Context, _ uuid.UUID, studentIDs []uuid.UUID) (map[uuid.UUID]GradeTrend, error) {
	out := map[uuid.UUID]GradeTrend{}
	for _, id := range studentIDs {
		if s := g.byID[id]; !s.gradingFails {
			out[id] = GradeTrend{Available: s.trendAvailable, PreviousAverage: s.previous, CurrentAverage: s.latest}
		}
	}
	return out, nil
}
