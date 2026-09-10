package domain

import "github.com/google/uuid"

// EraporSkipReason is why one student-subject pair did not make it into the
// e-Rapor import file. Both reasons must be reported per row rather than the
// row being silently dropped, since a school reconciles the skip list by
// hand before re-running the export.
type EraporSkipReason string

const (
	// EraporSkipMissingNISN: e-Rapor matches students by NISN; without one
	// there is nothing to key the import row on.
	EraporSkipMissingNISN EraporSkipReason = "missing_nisn"
	// EraporSkipNoPublishedScore covers both a subject whose grades were
	// never published for this class-term and a single student inside a
	// published subject who still has no computed report score (e.g. a
	// student who transferred in after grading closed).
	EraporSkipNoPublishedScore EraporSkipReason = "no_published_score"
)

// EraporSourceRow is one student-subject pair as read from this platform,
// before the e-Rapor shape is decided. Score is nil when no report score
// exists yet for this student in this subject.
type EraporSourceRow struct {
	StudentUserID    uuid.UUID
	StudentName      string
	NISN             string
	SubjectCode      string
	SubjectName      string
	SubjectPublished bool
	Score            *float64
}

// EraporRow is one line of the e-Rapor import: a student's final score for
// one subject, keyed by NISN and subject code the way e-Rapor expects.
type EraporRow struct {
	NISN        string
	SubjectCode string
	Score       float64
	Predicate   string
}

// EraporSkip reports one source row that did not become an EraporRow.
type EraporSkip struct {
	StudentName string
	SubjectName string
	Reason      EraporSkipReason
}

// EraporExport is the full mapping result: what will be imported, and what
// was left out and why.
type EraporExport struct {
	Rows    []EraporRow
	Skipped []EraporSkip
}

// EraporPredicate turns a score into the letter e-Rapor's import sheet
// expects (Sangat Baik/Baik/Cukup/Perlu Bimbingan, A-D), scaled to the
// tenant's own grading scale rather than assuming it runs 0-100.
func EraporPredicate(scale Scale, score float64) string {
	span := scale.Max - scale.Min
	percent := 100.0
	if span > 0 {
		percent = (score - scale.Min) / span * 100
	}
	switch {
	case percent >= 90:
		return "A"
	case percent >= 80:
		return "B"
	case percent >= 70:
		return "C"
	default:
		return "D"
	}
}

// BuildEraporRows is the pure mapping from this platform's report scores to
// the e-Rapor import shape: one row per student per subject, or a skip entry
// with a reason when the row cannot be produced. It never drops a source row
// without accounting for it in one of the two output slices.
func BuildEraporRows(scale Scale, sources []EraporSourceRow) EraporExport {
	var out EraporExport
	for _, src := range sources {
		switch {
		case src.NISN == "":
			out.Skipped = append(out.Skipped, EraporSkip{
				StudentName: src.StudentName, SubjectName: src.SubjectName, Reason: EraporSkipMissingNISN,
			})
		case !src.SubjectPublished || src.Score == nil:
			out.Skipped = append(out.Skipped, EraporSkip{
				StudentName: src.StudentName, SubjectName: src.SubjectName, Reason: EraporSkipNoPublishedScore,
			})
		default:
			out.Rows = append(out.Rows, EraporRow{
				NISN: src.NISN, SubjectCode: src.SubjectCode, Score: *src.Score,
				Predicate: EraporPredicate(scale, *src.Score),
			})
		}
	}
	return out
}
