package domain

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func day(y int, m time.Month, d int) time.Time {
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
}

// TestValidateTermPlacement covers the two rules CreateTerm/UpdateTerm
// enforce: a term lies within its academic year, and no calendar day
// belongs to two terms (both ends inclusive).
func TestValidateTermPlacement(t *testing.T) {
	year := AcademicYear{StartsOn: day(2026, 7, 13), EndsOn: day(2027, 6, 30)}
	sem1 := Term{ID: uuid.New(), StartsOn: day(2026, 7, 13), EndsOn: day(2026, 12, 20)}
	sem2 := Term{ID: uuid.New(), StartsOn: day(2027, 1, 4), EndsOn: day(2027, 6, 18)}
	siblings := []Term{sem1, sem2}

	tests := []struct {
		name      string
		excludeID uuid.UUID
		start     time.Time
		end       time.Time
		want      error
	}{
		{"overlaps both semesters", uuid.Nil, day(2026, 12, 1), day(2027, 1, 30), ErrTermOverlap},
		{"shares the last day of semester 1", uuid.Nil, day(2026, 12, 20), day(2027, 1, 2), ErrTermOverlap},
		{"shares the first day of semester 2", uuid.Nil, day(2026, 12, 21), day(2027, 1, 4), ErrTermOverlap},
		{"fits the gap between semesters", uuid.Nil, day(2026, 12, 21), day(2027, 1, 3), nil},
		{"starts before the year", uuid.Nil, day(2026, 7, 1), day(2026, 7, 10), ErrTermOutsideYear},
		{"ends after the year", uuid.Nil, day(2027, 6, 20), day(2027, 7, 5), ErrTermOutsideYear},
		{"editing a term ignores itself", sem1.ID, day(2026, 7, 13), day(2026, 12, 31), nil},
		{"editing a term into its sibling", sem1.ID, day(2026, 7, 13), day(2027, 1, 10), ErrTermOverlap},
		{"time of day does not matter", uuid.Nil, day(2026, 12, 21).Add(23 * time.Hour), day(2027, 1, 3).Add(time.Hour), nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateTermPlacement(year, siblings, tt.excludeID, tt.start, tt.end)
			if tt.want == nil {
				require.NoError(t, err)
			} else {
				require.ErrorIs(t, err, tt.want)
			}
		})
	}
}

// TestBuildDefaultTermsShareNoDay proves the generated terms cover the
// year back to back without sharing a boundary day, so a year created with
// default terms passes ValidateTermPlacement (and the database's
// no-overlap constraint) for every one of them.
func TestBuildDefaultTermsShareNoDay(t *testing.T) {
	for _, count := range []int{2, 3, 4} {
		year := AcademicYear{StartsOn: day(2026, 7, 13), EndsOn: day(2027, 6, 30)}
		terms := BuildDefaultTerms(uuid.New(), uuid.New(), year.StartsOn, year.EndsOn, count)
		require.Len(t, terms, count)
		require.Equal(t, year.StartsOn, terms[0].StartsOn)
		require.Equal(t, year.EndsOn, terms[count-1].EndsOn)
		for i := range terms {
			terms[i].ID = uuid.New()
		}
		for i, term := range terms {
			require.True(t, term.EndsOn.After(term.StartsOn), "term %d of %d", i+1, count)
			if i > 0 {
				require.Equal(t, terms[i-1].EndsOn.AddDate(0, 0, 1), term.StartsOn, "term %d of %d starts the day after the previous ends", i+1, count)
			}
			require.NoError(t, ValidateTermPlacement(year, terms, term.ID, term.StartsOn, term.EndsOn))
		}
	}
}
