package main

import (
	"database/sql"
	"fmt"
	"time"
)

// SionAttendanceSession is one live-schema attendances row: one class's
// roll call for one subject/period/day, always tied to exactly one
// schedules row. teacher_id is whoever actually recorded it;
// replaced_teacher_id, when set, is the teacher the schedule originally
// assigned -- confirmed against the live data (every replaced_teacher_id
// equals the schedule's own teacher_classes.user_id), so
// migrate_attendance.go treats replaced_teacher_id as the session's
// teacher_user_id and teacher_id as its substitute_user_id.
type SionAttendanceSession struct {
	ID                int64
	TeacherID         int64
	ReplacedTeacherID sql.NullInt64
	ClassID           int64
	SubjectID         int64
	PeriodID          int64
	ScheduleID        int64
	AttendanceDate    time.Time
	CreatedAt         sql.NullTime
}

// FetchAttendanceSessions reads every attendances row for classes belonging
// to the migrated year (joined through groups, the same scoping every other
// year-scoped fetch in this package uses).
func (s *Source) FetchAttendanceSessions(yearID int64) ([]SionAttendanceSession, error) {
	rows, err := s.db.Query(
		`select a.id, a.teacher_id, a.replaced_teacher_id, a.group_id, a.subject_id,
		        a.period_id, a.schedule_id, a.attendance_date, a.created_at
		 from attendances a
		 join groups g on g.id = a.group_id
		 where g.year_id = ?
		 order by a.id`,
		yearID,
	)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []SionAttendanceSession
	for rows.Next() {
		var a SionAttendanceSession
		if err := rows.Scan(
			&a.ID, &a.TeacherID, &a.ReplacedTeacherID, &a.ClassID, &a.SubjectID,
			&a.PeriodID, &a.ScheduleID, &a.AttendanceDate, &a.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// SionAttendanceEntry is one live-schema attendance_details row: one
// student's status within one attendances session.
type SionAttendanceEntry struct {
	ID           int64
	AttendanceID int64
	StudentID    int64
	Status       string
	Notes        sql.NullString
}

// attendanceEntryBatchSize bounds how many attendance_details rows one
// MySQL query returns at a time. attendance_details is the source's
// largest table (about 163k rows for this school) -- FetchAttendanceEntries
// pages through it with keyset pagination on id instead of a single
// unbounded select, so no single query result needs to be buffered in
// full.
const attendanceEntryBatchSize = 5000

// FetchAttendanceEntries reads every attendance_details row for the
// migrated year (scoped the same way as FetchAttendanceSessions, through
// attendances -> groups), grouped by attendance_id. It pages through the
// source in attendanceEntryBatchSize chunks rather than one large query;
// the grouped result is still held in memory once fully read (a few tens of
// MB at this school's size), which migrate_attendance.go needs anyway to
// resolve each entry against its already-migrated session.
func (s *Source) FetchAttendanceEntries(yearID int64) (map[int64][]SionAttendanceEntry, error) {
	out := make(map[int64][]SionAttendanceEntry)
	var afterID int64
	for {
		batch, err := s.fetchAttendanceEntryBatch(yearID, afterID)
		if err != nil {
			return nil, fmt.Errorf("fetch attendance_details after id %d: %w", afterID, err)
		}
		if len(batch) == 0 {
			break
		}
		for _, e := range batch {
			out[e.AttendanceID] = append(out[e.AttendanceID], e)
			afterID = e.ID
		}
		if len(batch) < attendanceEntryBatchSize {
			break
		}
	}
	return out, nil
}

func (s *Source) fetchAttendanceEntryBatch(yearID, afterID int64) ([]SionAttendanceEntry, error) {
	rows, err := s.db.Query(
		`select ad.id, ad.attendance_id, ad.student_id, ad.status, ad.notes
		 from attendance_details ad
		 join attendances a on a.id = ad.attendance_id
		 join groups g on g.id = a.group_id
		 where g.year_id = ? and ad.id > ?
		 order by ad.id
		 limit ?`,
		yearID, afterID, attendanceEntryBatchSize,
	)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []SionAttendanceEntry
	for rows.Next() {
		var e SionAttendanceEntry
		if err := rows.Scan(&e.ID, &e.AttendanceID, &e.StudentID, &e.Status, &e.Notes); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
