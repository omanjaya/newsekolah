package domain_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
)

func date(s string) time.Time {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		panic(err)
	}
	return t
}

func TestIsSchoolDay(t *testing.T) {
	gradeX := uuid.New()
	gradeXI := uuid.New()

	t.Run("weekday not in the weekly pattern is never a school day", func(t *testing.T) {
		require.False(t, domain.IsSchoolDay(date("2026-01-05"), false, nil, nil))
	})

	t.Run("an ordinary weekday with no events is a school day", func(t *testing.T) {
		require.True(t, domain.IsSchoolDay(date("2026-01-05"), true, nil, nil))
	})

	t.Run("a school-wide holiday cancels teaching for every grade", func(t *testing.T) {
		events := []domain.CalendarEvent{
			{Kind: domain.CalendarEventHoliday, Date: date("2026-01-05"), EndDate: date("2026-01-05")},
		}
		require.False(t, domain.IsSchoolDay(date("2026-01-05"), true, events, nil))
		require.False(t, domain.IsSchoolDay(date("2026-01-05"), true, events, &gradeX))
	})

	t.Run("a multi-day semester break covers every date in its range", func(t *testing.T) {
		events := []domain.CalendarEvent{
			{Kind: domain.CalendarEventSemesterBreak, Date: date("2026-06-20"), EndDate: date("2026-07-10")},
		}
		require.False(t, domain.IsSchoolDay(date("2026-06-25"), true, events, nil))
		require.True(t, domain.IsSchoolDay(date("2026-07-11"), true, events, nil))
		require.True(t, domain.IsSchoolDay(date("2026-06-19"), true, events, nil))
	})

	t.Run("an exam does not cancel teaching", func(t *testing.T) {
		events := []domain.CalendarEvent{
			{Kind: domain.CalendarEventExam, Date: date("2026-01-05"), EndDate: date("2026-01-05")},
		}
		require.True(t, domain.IsSchoolDay(date("2026-01-05"), true, events, nil))
	})

	t.Run("a grade-scoped no-school day only cancels teaching for that grade", func(t *testing.T) {
		events := []domain.CalendarEvent{
			{
				Kind: domain.CalendarEventNoSchool, Date: date("2026-01-05"), EndDate: date("2026-01-05"),
				GradeLevelIDs: []uuid.UUID{gradeX},
			},
		}
		require.False(t, domain.IsSchoolDay(date("2026-01-05"), true, events, &gradeX))
		require.True(t, domain.IsSchoolDay(date("2026-01-05"), true, events, &gradeXI))
		require.True(t, domain.IsSchoolDay(date("2026-01-05"), true, events, nil))
	})
}

func TestNonTeachingEventName(t *testing.T) {
	gradeX := uuid.New()

	t.Run("names a school-wide holiday", func(t *testing.T) {
		events := []domain.CalendarEvent{
			{Kind: domain.CalendarEventHoliday, Name: "Hari Kemerdekaan", Date: date("2026-08-17"), EndDate: date("2026-08-17")},
		}
		name, found := domain.NonTeachingEventName(date("2026-08-17"), events, nil)
		require.True(t, found)
		require.Equal(t, "Hari Kemerdekaan", name)
	})

	t.Run("finds nothing for an ordinary school day", func(t *testing.T) {
		_, found := domain.NonTeachingEventName(date("2026-08-18"), nil, nil)
		require.False(t, found)
	})

	t.Run("finds nothing for a plain weekend with no named event", func(t *testing.T) {
		_, found := domain.NonTeachingEventName(date("2026-01-04"), nil, nil)
		require.False(t, found)
	})

	t.Run("an exam is not a non-teaching event", func(t *testing.T) {
		events := []domain.CalendarEvent{
			{Kind: domain.CalendarEventExam, Name: "Ujian Tengah Semester", Date: date("2026-01-05"), EndDate: date("2026-01-05")},
		}
		_, found := domain.NonTeachingEventName(date("2026-01-05"), events, nil)
		require.False(t, found)
	})

	t.Run("a grade-scoped event names only for that grade", func(t *testing.T) {
		events := []domain.CalendarEvent{
			{
				Kind: domain.CalendarEventNoSchool, Name: "Retreat Kelas X", Date: date("2026-01-05"), EndDate: date("2026-01-05"),
				GradeLevelIDs: []uuid.UUID{gradeX},
			},
		}
		name, found := domain.NonTeachingEventName(date("2026-01-05"), events, &gradeX)
		require.True(t, found)
		require.Equal(t, "Retreat Kelas X", name)
		_, found = domain.NonTeachingEventName(date("2026-01-05"), events, nil)
		require.False(t, found)
	})
}
