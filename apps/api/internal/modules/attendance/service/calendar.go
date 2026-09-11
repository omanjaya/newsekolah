package service

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
)

// parseMonthRange turns a "YYYY-MM" string into the half-open [from, to)
// date range that month covers.
func parseMonthRange(month string) (time.Time, time.Time, error) {
	from, err := time.Parse("2006-01", month)
	if err != nil {
		return time.Time{}, time.Time{}, domain.ErrInvalidMonth
	}
	return from, from.AddDate(0, 1, 0), nil
}

// GetStudentCalendarMonth returns studentUserID's daily status for every
// day of month, in the tenant's currently active academic year.
func (s *Service) GetStudentCalendarMonth(ctx context.Context, tenantID, studentUserID uuid.UUID, month string) ([]CalendarDay, error) {
	from, to, err := parseMonthRange(month)
	if err != nil {
		return nil, err
	}

	var days []CalendarDay
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeAcademicYear(ctx, tenantID)
		if err != nil {
			return err
		}
		policy, err := s.loadStatusPolicy(ctx, tenantID)
		if err != nil {
			return err
		}
		days, err = s.buildCalendarDays(ctx, tenantID, yearID, studentUserID, from, to, policy)
		return err
	})
	return days, err
}

// GetMonthlySummary is GetStudentCalendarMonth plus a per-status total
// across the month, for the reporting endpoint (any view_reports holder,
// not just the student themselves).
func (s *Service) GetMonthlySummary(ctx context.Context, tenantID, studentUserID uuid.UUID, month string) ([]CalendarDay, map[string]int, error) {
	days, err := s.GetStudentCalendarMonth(ctx, tenantID, studentUserID, month)
	if err != nil {
		return nil, nil, err
	}
	totals := make(map[string]int, len(days))
	for _, d := range days {
		totals[d.StatusCode]++
	}
	return days, totals, nil
}

// buildCalendarDays materializes one CalendarDay per date in [from, to):
// a day already summarized in attendance_daily_summary is read as-is; a
// day that has never been saved (no attendance session submitted yet, or
// none scheduled) is computed live via the same domain.ComputeDailyStatus
// algorithm, so the two paths can never disagree. The student's class is
// resolved once for the whole range (approximating a stable enrollment
// within one month).
//
//nolint:gocyclo // TODO(attendance): split into smaller steps; kept linear for auditability of the rule order
func (s *Service) buildCalendarDays(
	ctx context.Context, tenantID, academicYearID, studentUserID uuid.UUID, from, to time.Time, policy domain.StatusPolicy,
) ([]CalendarDay, error) {
	classID, hasClass, err := s.repo.GetEnrolledClass(ctx, tenantID, academicYearID, studentUserID)
	if err != nil {
		return nil, err
	}

	summaries, err := s.repo.ListDailySummaryForStudentMonth(ctx, tenantID, academicYearID, studentUserID, from, to)
	if err != nil {
		return nil, err
	}
	byDate := make(map[string]DailySummaryRow, len(summaries))
	for _, row := range summaries {
		byDate[row.Date.Format("2006-01-02")] = row
	}

	days := make([]CalendarDay, 0, 31)
	for d := from; d.Before(to); d = d.AddDate(0, 0, 1) {
		day := CalendarDay{Date: d}

		var sessionsForDay []domain.Session
		if hasClass {
			sessionsForDay, err = s.repo.ListSessionsByClassDate(ctx, tenantID, classID, d)
			if err != nil {
				return nil, err
			}
		}
		var sessionNames map[uuid.UUID]SessionDetailRow
		if len(sessionsForDay) > 0 {
			details, err := s.repo.ListSessionDetailsForClassDate(ctx, tenantID, classID, d)
			if err != nil {
				return nil, err
			}
			sessionNames = make(map[uuid.UUID]SessionDetailRow, len(details))
			for _, det := range details {
				sessionNames[det.SessionID] = det
			}
		}
		for _, sess := range sessionsForDay {
			cds := CalendarDaySession{ScheduleID: sess.ScheduleID, SubjectID: sess.SubjectID, TeacherUserID: sess.TeacherUserID}
			if names, ok := sessionNames[sess.ID]; ok {
				cds.SubjectName, cds.TeacherName = names.SubjectName, names.TeacherName
				cds.PeriodLabel = periodLabel(names.StartPeriodName, names.EndPeriodName)
			}
			if entry, found, err := s.repo.GetEntryBySessionStudent(ctx, tenantID, sess.ID, studentUserID); err != nil {
				return nil, err
			} else if found {
				cds.StatusCode, cds.Note, cds.Source = entry.StatusCode, entry.Notes, entry.Source
			}
			day.Sessions = append(day.Sessions, cds)
		}

		if row, ok := byDate[d.Format("2006-01-02")]; ok {
			day.StatusCode, day.ExpectedSessions, day.SubmittedSessions = row.StatusCode, row.ExpectedSessions, row.SubmittedSessions
			day.Complete = row.ExpectedSessions == 0 || row.SubmittedSessions >= row.ExpectedSessions
			days = append(days, day)
			continue
		}

		// A day forced by an issued leave letter or exit permit (via
		// Overrider) shows that official status even when it has no
		// session at all -- ForceStatus only ever writes into sessions
		// that already exist (see service/force.go's doc comment), so a
		// day with no schedule, or one whose sessions were never opened,
		// would otherwise render INCOMPLETE/NONE despite the student
		// having an approved leave that day (docs/analysis/backend-
		// inventory.md section 1.13's "hari override tetap muncul walau
		// tanpa sesi").
		if overrideCode, overrideSource, ok, err := s.overrider.Override(ctx, tenantID, studentUserID, d); err != nil {
			return nil, err
		} else if ok {
			day.StatusCode, day.Complete = overrideCode, true
			if len(day.Sessions) == 0 {
				day.Sessions = []CalendarDaySession{{StatusCode: overrideCode, Source: overrideSource}}
			}
			days = append(days, day)
			continue
		}

		expected, submitted := 0, 0
		if hasClass {
			dayOfWeek := domain.IsoWeekday(d)
			isSchoolDay, err := s.repo.IsSchoolDay(ctx, tenantID, academicYearID, dayOfWeek)
			if err != nil {
				return nil, err
			}
			if isSchoolDay {
				count, err := s.schedules.CountSchedulesForClassDay(ctx, tenantID, academicYearID, classID, dayOfWeek)
				if err != nil {
					return nil, err
				}
				expected = int(count)
			}
			for _, sess := range sessionsForDay {
				if sess.IsSubmitted() {
					submitted++
				}
			}
		}

		statuses, err := s.repo.ListEntryStatusesForStudentDate(ctx, tenantID, studentUserID, d)
		if err != nil {
			return nil, err
		}
		result := domain.ComputeDailyStatus(expected, submitted, statuses, policy)
		day.StatusCode, day.ExpectedSessions, day.SubmittedSessions, day.Complete = result.StatusCode, result.Expected, result.Submitted, result.Complete
		days = append(days, day)
	}
	return days, nil
}

// GetHomeroomAttendance returns actor's homeroom class roster with each
// student's daily status for date. actor must hold the homeroom duty for
// some class this academic year -- there is no class_id parameter on this
// endpoint (attendance.yaml), it is always the caller's own homeroom.
// HomeroomFilter narrows and paginates it, and HomeroomRoster carries a
// student card (guardian contact, violation summary) the plain daily
// report has no need for (docs/analysis/backend-inventory.md section
// 1.9's homeroom "kartu siswa").
type HomeroomFilter struct {
	// Search matches a student's name or NIS, case-insensitively.
	Search        string
	StatusCode    string
	Limit, Offset int
}

// HomeroomEntry is one student's homeroom roster row: their daily status
// plus the contact and discipline summary a homeroom teacher's card needs.
type HomeroomEntry struct {
	RosterEntry
	NIS             string
	GuardianName    string
	GuardianPhone   string
	ViolationCount  int
	ViolationPoints int
}

// HomeroomRoster is GetHomeroomAttendance's full response: one page of
// HomeroomFilter-matching students, plus the per-status counts and total
// across every match (not just the page returned).
type HomeroomRoster struct {
	Students     []HomeroomEntry
	StatusCounts map[string]int
	Total        int
}

func (s *Service) GetHomeroomAttendance(ctx context.Context, tenantID uuid.UUID, actor Actor, date time.Time, f HomeroomFilter) (HomeroomRoster, error) {
	var out HomeroomRoster
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeAcademicYear(ctx, tenantID)
		if err != nil {
			return err
		}
		classID, ok, err := s.repo.GetHomeroomClassForTeacher(ctx, tenantID, yearID, actor.UserID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrNotHomeroomTeacher
		}

		roster, _, _, err := s.buildRoster(ctx, tenantID, yearID, classID, date)
		if err != nil {
			return err
		}
		students, err := s.repo.ListActiveEnrollments(ctx, tenantID, yearID, classID)
		if err != nil {
			return err
		}
		byStudent := make(map[uuid.UUID]StudentRef, len(students))
		for _, st := range students {
			byStudent[st.ID] = st
		}

		entries := make([]HomeroomEntry, 0, len(roster))
		for _, r := range roster {
			st := byStudent[r.StudentUserID]
			entry := HomeroomEntry{RosterEntry: r, NIS: st.NIS, GuardianName: st.GuardianName, GuardianPhone: st.GuardianPhone}
			entry.ViolationCount, entry.ViolationPoints, err = s.discipline.ViolationSummary(ctx, tenantID, yearID, r.StudentUserID)
			if err != nil {
				return err
			}
			entries = append(entries, entry)
		}

		entries = filterHomeroomEntries(entries, f)

		counts := make(map[string]int, len(entries))
		for _, e := range entries {
			counts[e.StatusCode]++
		}
		total := len(entries)

		limit := f.Limit
		if limit <= 0 || limit > 200 {
			limit = 50
		}
		offset := f.Offset
		if offset < 0 {
			offset = 0
		}
		if offset > len(entries) {
			offset = len(entries)
		}
		end := offset + limit
		if end > len(entries) {
			end = len(entries)
		}

		out = HomeroomRoster{Students: entries[offset:end], StatusCounts: counts, Total: total}
		return nil
	})
	return out, err
}

// filterHomeroomEntries applies f.Search (name or NIS, case-insensitive)
// and f.StatusCode, in that order. The roster and every school class it
// covers are small enough that filtering in Go, after computing each
// student's daily status, is simpler than pushing the search into SQL
// alongside domain.ComputeDailyStatus's in-memory algorithm.
func filterHomeroomEntries(entries []HomeroomEntry, f HomeroomFilter) []HomeroomEntry {
	out := entries
	if f.Search != "" {
		q := strings.ToLower(f.Search)
		filtered := make([]HomeroomEntry, 0, len(out))
		for _, e := range out {
			if strings.Contains(strings.ToLower(e.Name), q) || strings.Contains(strings.ToLower(e.NIS), q) {
				filtered = append(filtered, e)
			}
		}
		out = filtered
	}
	if f.StatusCode != "" {
		filtered := make([]HomeroomEntry, 0, len(out))
		for _, e := range out {
			if e.StatusCode == f.StatusCode {
				filtered = append(filtered, e)
			}
		}
		out = filtered
	}
	return out
}

// buildRoster is the shared roster-building step behind GetHomeroomAttendance
// and GetDailyReport: every actively enrolled student's daily status for
// date, plus the class's own expected/submitted session counts.
func (s *Service) buildRoster(ctx context.Context, tenantID, academicYearID, classID uuid.UUID, date time.Time) ([]RosterEntry, int, int, error) {
	policy, err := s.loadStatusPolicy(ctx, tenantID)
	if err != nil {
		return nil, 0, 0, err
	}

	students, err := s.repo.ListActiveEnrollments(ctx, tenantID, academicYearID, classID)
	if err != nil {
		return nil, 0, 0, err
	}

	rows, err := s.repo.ListDailySummaryForClassDate(ctx, tenantID, academicYearID, classID, date)
	if err != nil {
		return nil, 0, 0, err
	}
	byStudent := make(map[uuid.UUID]DailySummaryRow, len(rows))
	for _, r := range rows {
		byStudent[r.StudentUserID] = r
	}

	dayOfWeek := domain.IsoWeekday(date)
	isSchoolDay, err := s.repo.IsSchoolDay(ctx, tenantID, academicYearID, dayOfWeek)
	if err != nil {
		return nil, 0, 0, err
	}
	expected := 0
	if isSchoolDay {
		count, err := s.schedules.CountSchedulesForClassDay(ctx, tenantID, academicYearID, classID, dayOfWeek)
		if err != nil {
			return nil, 0, 0, err
		}
		expected = int(count)
	}
	submittedCount, err := s.repo.CountSubmittedSessionsByClassDate(ctx, tenantID, classID, date)
	if err != nil {
		return nil, 0, 0, err
	}
	submitted := int(submittedCount)

	roster := make([]RosterEntry, 0, len(students))
	for _, student := range students {
		if row, ok := byStudent[student.ID]; ok {
			roster = append(roster, RosterEntry{
				StudentUserID: student.ID, Name: student.Name, StatusCode: row.StatusCode,
				ExpectedSessions: row.ExpectedSessions, SubmittedSessions: row.SubmittedSessions,
				Complete:       row.ExpectedSessions == 0 || row.SubmittedSessions >= row.ExpectedSessions,
				PartialAbsence: row.PartialAbsence,
			})
			continue
		}
		statuses, err := s.repo.ListEntryStatusesForStudentDate(ctx, tenantID, student.ID, date)
		if err != nil {
			return nil, 0, 0, err
		}
		result := domain.ComputeDailyStatus(expected, submitted, statuses, policy)
		roster = append(roster, RosterEntry{
			StudentUserID: student.ID, Name: student.Name, StatusCode: result.StatusCode,
			ExpectedSessions: result.Expected, SubmittedSessions: result.Submitted, Complete: result.Complete,
			PartialAbsence: result.PartialAbsence,
		})
	}
	return roster, expected, submitted, nil
}
