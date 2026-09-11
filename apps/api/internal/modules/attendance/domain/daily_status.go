package domain

import "sort"

// Special status codes DailyStatus can return that are not part of any
// tenant's configured StatusPolicy: they describe the *absence* or
// *incompleteness* of recorded data, not an attendance outcome.
const (
	// StatusNone means the student had no scheduled session that day (a
	// holiday, a non-school weekday, or simply no class): there is
	// nothing to report, and this is not the same as being absent.
	StatusNone = "NONE"
	// StatusIncomplete means at least one of the day's expected sessions
	// has not been submitted yet: replaces the old system's bug of
	// silently treating "expected" as always equal to "submitted"
	// (docs/analysis/backend-inventory.md section 1.11), which made an
	// unrecorded session look identical to a fully-recorded day.
	StatusIncomplete = "INCOMPLETE"
	// StatusMixed is returned only in the degenerate case of zero
	// recorded entries despite a session being submitted (e.g. a class
	// with no enrolled students) -- there is no basis to pick any status.
	StatusMixed = "MIXED"
)

// DailyStatus is the result of the one algorithm every attendance view
// (student calendar, homeroom class view, daily report, monitor snapshot)
// must use, so they can never disagree about what a given student's day
// looked like.
type DailyStatus struct {
	StatusCode string
	Expected   int
	Submitted  int
	// Complete is true once every expected session for the day has been
	// submitted. A day can have a meaningful StatusCode (computed from
	// whatever has been submitted so far) while still being incomplete.
	Complete bool
	// PartialAbsence flags a day where at least one submitted session was
	// marked Alpha but not every one was -- the old system's "A_SEBAGIAN"
	// signal (docs/analysis/backend-inventory.md section 1.10/1.11). The
	// majority/priority algorithm below can resolve StatusCode to
	// something other than Alpha (e.g. two H sessions outvote one A) even
	// though the student was unexcused-absent at least once that day;
	// this field surfaces that regardless of which code wins StatusCode,
	// rather than let it be masked the way a plain majority would.
	PartialAbsence bool
}

// ComputeDailyStatus is the single canonical algorithm
// (docs/06-database-schema.md section 6: "satu algoritma domain untuk
// kalender, wali kelas, laporan"). It takes:
//
//   - expectedSessions: how many of the student's class's schedules fall on
//     this date (computed by the service from schedules + school_days,
//     fixing the old "daily report" bug of expected always equalling
//     submitted, docs/analysis/backend-inventory.md section 1.9/1.11);
//   - entries: every attendance_entries.status_code recorded for the
//     student across this date's *submitted* sessions only (a session not
//     yet submitted contributes to Expected but never to entries);
//   - policy: the tenant's configured statuses, for CountsAsPresent and
//     the tie-break Priority.
//
// Resolution order once there is at least one entry:
//  1. All entries share one code -> that code.
//  2. One code has a strict majority (> half of len(entries)) -> that code.
//  3. Otherwise -> the present code with the lowest Priority (most
//     deserving of attention), ties broken lexicographically by code for
//     determinism.
func ComputeDailyStatus(expectedSessions, submittedSessions int, entries []string, policy StatusPolicy) DailyStatus {
	result := DailyStatus{
		Expected:  expectedSessions,
		Submitted: submittedSessions,
		Complete:  expectedSessions > 0 && submittedSessions >= expectedSessions,
	}

	if expectedSessions == 0 {
		result.StatusCode = StatusNone
		result.Complete = true
		return result
	}
	if len(entries) == 0 {
		if submittedSessions == 0 {
			result.StatusCode = StatusIncomplete
		} else {
			// A session was submitted but produced no entries (e.g. an
			// empty class list): there is truly nothing to summarize.
			result.StatusCode = StatusMixed
		}
		return result
	}

	counts := make(map[string]int, len(entries))
	for _, code := range entries {
		counts[code]++
	}
	if n := counts[StatusCodeAlpha]; n > 0 && n < len(entries) {
		result.PartialAbsence = true
	}

	if majority, ok := strictMajority(counts, len(entries)); ok {
		result.StatusCode = majority
		return result
	}

	result.StatusCode = highestPriority(counts, policy)
	return result
}

func strictMajority(counts map[string]int, total int) (string, bool) {
	for code, n := range counts {
		if n*2 > total {
			return code, true
		}
	}
	return "", false
}

func highestPriority(counts map[string]int, policy StatusPolicy) string {
	codes := make([]string, 0, len(counts))
	for code := range counts {
		codes = append(codes, code)
	}
	sort.Slice(codes, func(i, j int) bool {
		pi, pj := policy.priority(codes[i]), policy.priority(codes[j])
		if pi != pj {
			return pi < pj
		}
		return codes[i] < codes[j]
	})
	return codes[0]
}
