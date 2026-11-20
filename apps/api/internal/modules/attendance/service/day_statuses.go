package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
)

// DateOverride is a status an Overrider forces for one student on one date.
type DateOverride struct {
	StudentUserID uuid.UUID
	Date          time.Time
	StatusCode    string
}

// BatchOverrider is an optional extension of Overrider: an implementation
// that can answer for many students and dates in one query. Without it,
// DayStatusesForStudents falls back to one Override call per pair, which
// gives the same answers more slowly.
type BatchOverrider interface {
	OverridesForDates(ctx context.Context, tenantID uuid.UUID, studentIDs []uuid.UUID, dates []time.Time) ([]DateOverride, error)
}

// StudentDayStatus is the daily status the student calendar shows one
// student on one date.
type StudentDayStatus struct {
	StudentUserID uuid.UUID
	Date          time.Time
	StatusCode    string
}

type studentDate struct {
	student uuid.UUID
	day     string
}

func dayKey(t time.Time) string { return t.Format("2006-01-02") }

// DayStatusesForStudents returns, for every (student, date) pair, the same
// status code GetStudentCalendarMonth reports for that student and day,
// resolved for many students at once with a handful of queries instead of
// several per student and day. The resolution order mirrors
// calendarDaysForRange exactly: a materialized daily summary row wins, then
// an Overrider status (an issued leave letter), then the status computed
// live from the class's schedules, its submitted sessions and the student's
// recorded entries via domain.ComputeDailyStatus.
//
// dates are calendar dates (the time of day is ignored); a date listed twice
// is answered once.
func (s *Service) DayStatusesForStudents(ctx context.Context, tenantID uuid.UUID, studentIDs []uuid.UUID, dates []time.Time) ([]StudentDayStatus, error) {
	studentIDs = uniqueIDs(studentIDs)
	dates = uniqueDates(dates)
	if len(studentIDs) == 0 || len(dates) == 0 {
		return nil, nil
	}

	var out []StudentDayStatus
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeAcademicYear(ctx, tenantID)
		if err != nil {
			return err
		}
		policy, err := s.loadStatusPolicy(ctx, tenantID)
		if err != nil {
			return err
		}
		resolved, err := s.summarizedStatuses(ctx, tenantID, yearID, studentIDs, dates)
		if err != nil {
			return err
		}
		pending := pendingPairs(studentIDs, dates, resolved)
		lessons, err := s.loadLessonDays(ctx, tenantID, yearID, pending)
		if err != nil {
			return err
		}
		if err := s.applyOverrides(ctx, tenantID, pending, resolved, lessons); err != nil {
			return err
		}
		if err := s.applyLiveStatuses(ctx, tenantID, yearID, policy, pendingPairs(studentIDs, dates, resolved), resolved, lessons); err != nil {
			return err
		}
		out = make([]StudentDayStatus, 0, len(studentIDs)*len(dates))
		for _, id := range studentIDs {
			for _, d := range dates {
				out = append(out, StudentDayStatus{StudentUserID: id, Date: d, StatusCode: resolved[studentDate{id, dayKey(d)}]})
			}
		}
		return nil
	})
	return out, err
}

func (s *Service) summarizedStatuses(ctx context.Context, tenantID, yearID uuid.UUID, studentIDs []uuid.UUID, dates []time.Time) (map[studentDate]string, error) {
	rows, err := s.repo.ListDailySummaryForStudentsDates(ctx, tenantID, yearID, studentIDs, dates)
	if err != nil {
		return nil, err
	}
	resolved := make(map[studentDate]string, len(studentIDs)*len(dates))
	for _, row := range rows {
		resolved[studentDate{row.StudentUserID, dayKey(row.Date)}] = row.StatusCode
	}
	return resolved, nil
}

// pendingPairs lists the (student, date) pairs with no status in resolved yet.
func pendingPairs(studentIDs []uuid.UUID, dates []time.Time, resolved map[studentDate]string) []StudentDayStatus {
	var out []StudentDayStatus
	for _, id := range studentIDs {
		for _, d := range dates {
			if _, ok := resolved[studentDate{id, dayKey(d)}]; !ok {
				out = append(out, StudentDayStatus{StudentUserID: id, Date: d})
			}
		}
	}
	return out
}

// lessonDays is whether each pending student has lessons on each date,
// resolved once per class and date: the academic calendar through
// teachingDay for a student with a class, the weekly pattern for one
// without.
type lessonDays struct {
	classOf  map[uuid.UUID]uuid.UUID // student -> active class
	weekly   map[int16]bool
	teaching map[classDate]bool
}

func (l lessonDays) has(student uuid.UUID, date time.Time) bool {
	if classID, ok := l.classOf[student]; ok {
		return l.teaching[classDate{classID, dayKey(date)}]
	}
	return l.weekly[domain.IsoWeekday(date)]
}

func (s *Service) loadLessonDays(ctx context.Context, tenantID, yearID uuid.UUID, pending []StudentDayStatus) (lessonDays, error) {
	l := lessonDays{teaching: map[classDate]bool{}}
	if len(pending) == 0 {
		return l, nil
	}
	students, _ := pairAxes(pending)
	var err error
	if l.classOf, err = s.repo.ListEnrolledClasses(ctx, tenantID, yearID, students); err != nil {
		return l, err
	}
	weekdays, err := s.repo.ListSchoolDayWeekdays(ctx, tenantID, yearID)
	if err != nil {
		return l, err
	}
	l.weekly = make(map[int16]bool, len(weekdays))
	for _, w := range weekdays {
		l.weekly[w] = true
	}
	for _, p := range pending {
		classID, ok := l.classOf[p.StudentUserID]
		if !ok {
			continue
		}
		key := classDate{classID, dayKey(p.Date)}
		if _, done := l.teaching[key]; done {
			continue
		}
		teaching, _, err := s.teachingDay(ctx, tenantID, yearID, classID, p.Date)
		if err != nil {
			return l, err
		}
		l.teaching[key] = teaching
	}
	return l, nil
}

// applyOverrides records the Overrider's status for every pending pair it
// forces one for, on days with lessons only: a leave letter's weekend or
// holiday is not a day of leave (calendarDaysForRange's
// overrideOnLessonDay).
func (s *Service) applyOverrides(ctx context.Context, tenantID uuid.UUID, pending []StudentDayStatus, resolved map[studentDate]string, lessons lessonDays) error {
	pending = withLessons(pending, lessons)
	if len(pending) == 0 {
		return nil
	}
	if batch, ok := s.overrider.(BatchOverrider); ok {
		students, dates := pairAxes(pending)
		overrides, err := batch.OverridesForDates(ctx, tenantID, students, dates)
		if err != nil {
			return err
		}
		wanted := make(map[studentDate]bool, len(pending))
		for _, p := range pending {
			wanted[studentDate{p.StudentUserID, dayKey(p.Date)}] = true
		}
		for _, o := range overrides {
			if key := (studentDate{o.StudentUserID, dayKey(o.Date)}); wanted[key] {
				resolved[key] = o.StatusCode
			}
		}
		return nil
	}
	for _, p := range pending {
		code, _, ok, err := s.overrider.Override(ctx, tenantID, p.StudentUserID, p.Date)
		if err != nil {
			return err
		}
		if ok {
			resolved[studentDate{p.StudentUserID, dayKey(p.Date)}] = code
		}
	}
	return nil
}

// withLessons keeps the pairs whose student has lessons on the date.
func withLessons(pairs []StudentDayStatus, lessons lessonDays) []StudentDayStatus {
	out := make([]StudentDayStatus, 0, len(pairs))
	for _, p := range pairs {
		if lessons.has(p.StudentUserID, p.Date) {
			out = append(out, p)
		}
	}
	return out
}

// liveInputs is everything the live computation of a daily status reads,
// loaded for many students and dates at once.
type liveInputs struct {
	classOf     map[uuid.UUID]uuid.UUID // student -> active class
	scheduled   map[classWeekday]int
	submittedBy map[classDate]int
	entries     map[studentDate][]string
}

func (s *Service) loadLiveInputs(ctx context.Context, tenantID, yearID uuid.UUID, classOf map[uuid.UUID]uuid.UUID, students []uuid.UUID, dates []time.Time) (liveInputs, error) {
	in := liveInputs{classOf: classOf}
	in.scheduled = map[classWeekday]int{}
	in.submittedBy = map[classDate]int{}
	if classIDs := distinctClasses(in.classOf); len(classIDs) > 0 {
		counts, err := s.schedules.CountSchedulesByClassDay(ctx, tenantID, yearID, classIDs)
		if err != nil {
			return in, err
		}
		for _, c := range counts {
			in.scheduled[classWeekday{c.ClassID, c.DayOfWeek}] = int(c.Count)
		}
		submitted, err := s.repo.CountSubmittedSessionsByClassesDates(ctx, tenantID, classIDs, dates)
		if err != nil {
			return in, err
		}
		for _, row := range submitted {
			in.submittedBy[classDate{row.ClassID, dayKey(row.Date)}] = row.Submitted
		}
	}

	entryRows, err := s.repo.ListEntryStatusesForStudentsDates(ctx, tenantID, students, dates)
	if err != nil {
		return in, err
	}
	in.entries = make(map[studentDate][]string, len(entryRows))
	for _, row := range entryRows {
		in.entries[studentDate{row.StudentUserID, dayKey(row.Date)}] = row.StatusCodes
	}
	return in, nil
}

// applyLiveStatuses computes the status of every remaining pair the way
// calendarDaysForRange does for a day nothing has summarized or
// overridden: a day without lessons (weekend, holiday, no-school day,
// semester break) expects none.
func (s *Service) applyLiveStatuses(
	ctx context.Context, tenantID, yearID uuid.UUID, policy domain.StatusPolicy, pending []StudentDayStatus, resolved map[studentDate]string,
	lessons lessonDays,
) error {
	if len(pending) == 0 {
		return nil
	}
	students, dates := pairAxes(pending)
	in, err := s.loadLiveInputs(ctx, tenantID, yearID, lessons.classOf, students, dates)
	if err != nil {
		return err
	}
	for _, p := range pending {
		classID, hasClass := in.classOf[p.StudentUserID]
		expected, submitted := 0, 0
		if hasClass {
			if lessons.has(p.StudentUserID, p.Date) {
				expected = in.scheduled[classWeekday{classID, domain.IsoWeekday(p.Date)}]
			}
			submitted = in.submittedBy[classDate{classID, dayKey(p.Date)}]
		}
		key := studentDate{p.StudentUserID, dayKey(p.Date)}
		resolved[key] = domain.ComputeDailyStatus(expected, submitted, in.entries[key], policy).StatusCode
	}
	return nil
}

type classWeekday struct {
	class   uuid.UUID
	weekday int16
}

type classDate struct {
	class uuid.UUID
	day   string
}

// pairAxes returns the distinct students and dates among pairs.
func pairAxes(pairs []StudentDayStatus) ([]uuid.UUID, []time.Time) {
	var students []uuid.UUID
	var dates []time.Time
	seenStudent := map[uuid.UUID]bool{}
	seenDate := map[string]bool{}
	for _, p := range pairs {
		if !seenStudent[p.StudentUserID] {
			seenStudent[p.StudentUserID] = true
			students = append(students, p.StudentUserID)
		}
		if k := dayKey(p.Date); !seenDate[k] {
			seenDate[k] = true
			dates = append(dates, p.Date)
		}
	}
	return students, dates
}

func distinctClasses(classOf map[uuid.UUID]uuid.UUID) []uuid.UUID {
	seen := make(map[uuid.UUID]bool, len(classOf))
	var out []uuid.UUID
	for _, id := range classOf {
		if !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}

func uniqueIDs(ids []uuid.UUID) []uuid.UUID {
	seen := make(map[uuid.UUID]bool, len(ids))
	out := make([]uuid.UUID, 0, len(ids))
	for _, id := range ids {
		if !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}

func uniqueDates(dates []time.Time) []time.Time {
	seen := make(map[string]bool, len(dates))
	out := make([]time.Time, 0, len(dates))
	for _, d := range dates {
		if k := dayKey(d); !seen[k] {
			seen[k] = true
			out = append(out, d)
		}
	}
	return out
}
