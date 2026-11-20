package domain_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
)

func day(value string) time.Time {
	d, err := time.Parse(time.DateOnly, value)
	if err != nil {
		panic(err)
	}
	return d
}

func dayPtr(value string) *time.Time {
	d := day(value)
	return &d
}

func TestEffectiveOnHasInclusiveBounds(t *testing.T) {
	s := domain.Schedule{DayOfWeek: 4, EffectiveFrom: day("2026-11-05"), EffectiveUntil: dayPtr("2026-11-26")}
	require.False(t, s.EffectiveOn(day("2026-11-04")))
	require.True(t, s.EffectiveOn(day("2026-11-05")))
	require.True(t, s.EffectiveOn(day("2026-11-26")))
	require.False(t, s.EffectiveOn(day("2026-11-27")))
	// A date in another zone compares by its own calendar date.
	makassar := time.FixedZone("WITA", 8*3600)
	require.True(t, s.EffectiveOn(time.Date(2026, 11, 26, 0, 0, 0, 0, makassar)))

	open := domain.Schedule{EffectiveFrom: day("2026-11-05")}
	require.True(t, open.EffectiveOn(day("2030-01-01")))
	require.False(t, open.EndedBefore(day("2030-01-01")))
	require.True(t, s.EndedBefore(day("2026-11-27")))
	require.False(t, s.EndedBefore(day("2026-11-26")))
}

func TestWeekdaySnapping(t *testing.T) {
	// 2026-11-26 is a Thursday.
	require.Equal(t, day("2026-11-26"), domain.OnOrAfter(day("2026-11-26"), 4))
	require.Equal(t, day("2026-12-03"), domain.OnOrAfter(day("2026-11-27"), 4))
	require.Equal(t, day("2026-11-30"), domain.OnOrAfter(day("2026-11-27"), 1))
	require.Equal(t, day("2026-11-26"), domain.OnOrBefore(day("2026-11-29"), 4))
	require.Equal(t, day("2026-11-19"), domain.OnOrBefore(day("2026-11-25"), 4))
	require.Equal(t, day("2026-11-23"), domain.WeekStart(day("2026-11-29")), "Sunday belongs to the week before")
	require.Equal(t, day("2026-11-30"), domain.WeekStart(day("2026-11-30")))
	require.Equal(t, day("2026-11-27"), domain.DateInWeek(day("2026-11-23"), 5))

	from, until, ok := domain.SnapRange(4, day("2026-11-23"), dayPtr("2026-12-01"))
	require.True(t, ok)
	require.Equal(t, day("2026-11-26"), from)
	require.Equal(t, day("2026-11-26"), *until)
	_, _, ok = domain.SnapRange(4, day("2026-11-27"), dayPtr("2026-12-02"))
	require.False(t, ok, "no Thursday between Friday and the next Wednesday")
	from, until, ok = domain.SnapRange(1, day("2026-11-27"), nil)
	require.True(t, ok)
	require.Equal(t, day("2026-11-30"), from)
	require.Nil(t, until)
}

func TestResnapForWeekday(t *testing.T) {
	yearStart := day("2026-07-13") // a Monday
	// A whole-year Monday lesson becomes a whole-year Thursday lesson.
	from, until, ok := domain.ResnapForWeekday(day("2026-07-13"), nil, 1, 4, yearStart)
	require.True(t, ok)
	require.Equal(t, day("2026-07-16"), from)
	require.Nil(t, until)
	// A later version keeps the ISO weeks of both bounds.
	from, until, ok = domain.ResnapForWeekday(day("2026-11-26"), dayPtr("2026-12-10"), 4, 1, yearStart)
	require.True(t, ok)
	require.Equal(t, day("2026-11-23"), from)
	require.Equal(t, day("2026-12-07"), *until)
}

func TestEarliestChange(t *testing.T) {
	today := day("2026-11-20")
	require.Equal(t, today, domain.EarliestChange(today, nil))
	require.Equal(t, today, domain.EarliestChange(today, dayPtr("2026-11-16")))
	require.Equal(t, day("2026-11-27"), domain.EarliestChange(today, dayPtr("2026-11-26")), "a pending substitution next Thursday")
}

func TestPlanChange(t *testing.T) {
	thursday := domain.Schedule{DayOfWeek: 4, EffectiveFrom: day("2026-07-16")}

	plan, err := domain.PlanChange(thursday, day("2026-11-30"))
	require.NoError(t, err)
	require.Equal(t, domain.ChangeRetire, plan.Kind)
	require.Equal(t, day("2026-11-26"), plan.Until, "the last Thursday before the change")

	plan, err = domain.PlanChange(thursday, day("2026-11-26"))
	require.NoError(t, err)
	require.Equal(t, day("2026-11-19"), plan.Until, "a change on the lesson's own day ends it the week before")

	future := domain.Schedule{DayOfWeek: 4, EffectiveFrom: day("2026-12-03")}
	plan, err = domain.PlanChange(future, day("2026-12-01"))
	require.NoError(t, err)
	require.Equal(t, domain.ChangeDrop, plan.Kind, "no lesson before the change date")

	ended := domain.Schedule{DayOfWeek: 4, EffectiveFrom: day("2026-07-16"), EffectiveUntil: dayPtr("2026-11-19")}
	_, err = domain.PlanChange(ended, day("2026-11-30"))
	require.ErrorIs(t, err, domain.ErrScheduleEnded)
	plan, err = domain.PlanChange(ended, day("2026-11-19"))
	require.NoError(t, err)
	require.Equal(t, day("2026-11-12"), plan.Until)
}

func TestDetectConflictComparesEffectiveDates(t *testing.T) {
	class, teacher, other := uuid.New(), uuid.New(), uuid.New()
	retired := domain.Schedule{
		ID: uuid.New(), ClassID: class, TeacherUserID: teacher, DayOfWeek: 4, StartSeq: 1, EndSeq: 2,
		EffectiveFrom: day("2026-07-16"), EffectiveUntil: dayPtr("2026-11-26"),
	}
	existing := []domain.Schedule{retired}

	// The freed slot can be taken from the next Thursday on.
	next := domain.Schedule{ClassID: class, TeacherUserID: other, DayOfWeek: 4, StartSeq: 1, EndSeq: 1, EffectiveFrom: day("2026-12-03")}
	require.NoError(t, domain.DetectConflict(existing, next, uuid.Nil))

	// Starting on the retired version's last Thursday clashes with it.
	early := next
	early.EffectiveFrom = day("2026-11-26")
	err := domain.DetectConflict(existing, early, uuid.Nil)
	var conflict *domain.ConflictError
	require.ErrorAs(t, err, &conflict)
	require.ErrorIs(t, err, domain.ErrConflictClass)
	require.Equal(t, retired.ID, conflict.With.ID)

	// A teacher is double-booked only across versions that overlap.
	otherClass := domain.Schedule{ClassID: uuid.New(), TeacherUserID: teacher, DayOfWeek: 4, StartSeq: 2, EndSeq: 2, EffectiveFrom: day("2026-12-03")}
	require.NoError(t, domain.DetectConflict(existing, otherClass, uuid.Nil))
	otherClass.EffectiveFrom = day("2026-11-19")
	require.ErrorIs(t, domain.DetectConflict(existing, otherClass, uuid.Nil), domain.ErrConflictTeacher)

	// Snapped bounds: retired "from Monday 30 Nov" ends Thursday 26 Nov,
	// a new lesson "from Friday 27 Nov" starts Thursday 3 Dec -- no clash
	// although the typed dates overlapped.
	start, _, ok := domain.SnapRange(4, day("2026-11-27"), nil)
	require.True(t, ok)
	snapped := next
	snapped.EffectiveFrom = start
	require.NoError(t, domain.DetectConflict(existing, snapped, uuid.Nil))
}

func TestMergeContiguousKeepsVersionsApart(t *testing.T) {
	class, subject, teacher := uuid.New(), uuid.New(), uuid.New()
	base := domain.Schedule{ClassID: class, SubjectID: subject, TeacherUserID: teacher, DayOfWeek: 1, Source: domain.SourceAdmin, EffectiveFrom: day("2026-07-13")}
	a := base
	a.ID, a.StartSeq, a.EndSeq = uuid.New(), 1, 1
	b := base
	b.ID, b.StartSeq, b.EndSeq = uuid.New(), 2, 2
	require.Len(t, domain.MergeContiguous([]domain.Schedule{a, b}), 1)

	b.EffectiveFrom = day("2026-11-30")
	blocks := domain.MergeContiguous([]domain.Schedule{a, b})
	require.Len(t, blocks, 2, "rows with different dates are different blocks")

	b.EffectiveFrom = a.EffectiveFrom
	b.EffectiveUntil = dayPtr("2026-11-23")
	require.Len(t, domain.MergeContiguous([]domain.Schedule{a, b}), 2)
	a.EffectiveUntil = dayPtr("2026-11-23")
	merged := domain.MergeContiguous([]domain.Schedule{a, b})
	require.Len(t, merged, 1)
	require.Equal(t, day("2026-11-23"), *merged[0].EffectiveUntil)
}

func TestTypedErrorsUnwrap(t *testing.T) {
	var tooEarly error = &domain.ChangeTooEarlyError{Min: day("2026-11-27")}
	require.ErrorIs(t, tooEarly, domain.ErrScheduleChangeBeforeHistory)
	var needsDate error = &domain.HistoryRequiresDateError{Min: day("2026-11-27")}
	require.ErrorIs(t, needsDate, domain.ErrScheduleHasHistory)
	require.Contains(t, needsDate.Error(), "2026-11-27")
}
