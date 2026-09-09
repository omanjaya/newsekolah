package main

import "time"

// SionAttendanceSession is one row of attendance_sessions: one class period
// on one date, linked back to the recurring teaching_schedule it came from.
type SionAttendanceSession struct {
	ID                 string
	AttendanceDate     time.Time
	TeachingScheduleID string
	ClassID            string
	TeacherUserID      string
	SubjectID          string
	StartPeriodID      string
	EndPeriodID        string
}

func (s *Source) FetchAttendanceSessions(academicYearID string) ([]SionAttendanceSession, error) {
	rows, err := s.db.Query(
		`select id, attendance_date, teaching_schedule_id, class_id, teacher_user_id, subject_id, start_period_id, end_period_id
		 from attendance_sessions where academic_year_id = ?`,
		academicYearID,
	)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []SionAttendanceSession
	for rows.Next() {
		var a SionAttendanceSession
		if err := rows.Scan(
			&a.ID, &a.AttendanceDate, &a.TeachingScheduleID, &a.ClassID,
			&a.TeacherUserID, &a.SubjectID, &a.StartPeriodID, &a.EndPeriodID,
		); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// SionAttendanceEntry is one student's status within a session.
type SionAttendanceEntry struct {
	SessionID     string
	StudentUserID string
	Status        string
	Notes         string
}

// FetchAttendanceEntries reads every entry for the sessions of one academic
// year in a single query, joining back to attendance_sessions to apply the
// year filter (attendance_entries itself carries no academic_year_id).
func (s *Source) FetchAttendanceEntries(academicYearID string) ([]SionAttendanceEntry, error) {
	rows, err := s.db.Query(
		`select ae.session_id, ae.student_user_id, ae.status, ae.notes
		 from attendance_entries ae
		 join attendance_sessions asess on asess.id = ae.session_id
		 where asess.academic_year_id = ?`,
		academicYearID,
	)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []SionAttendanceEntry
	for rows.Next() {
		var e SionAttendanceEntry
		if err := rows.Scan(&e.SessionID, &e.StudentUserID, &e.Status, &e.Notes); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
