package main

import (
	"database/sql"
	"time"
)

// SionLeaveRequest is one row of student_leave_requests. The ETL only reads
// rows that reached a terminal, letter-bearing state ("issued"): see
// docs/13-etl-sion.md for why in-flight approvals are a documented gap
// rather than replayed through the new workflow engine.
type SionLeaveRequest struct {
	ID                   string
	StudentUserID        string
	ClassID              string
	StudentNameSnapshot  string
	ClassNameSnapshot    string
	GuardianNameSnapshot sql.NullString
	Category             string
	Reason               string
	StartDate            time.Time
	EndDate              time.Time
	IssuedByUserID       sql.NullString
	LetterNumber         sql.NullString
	IssuedAt             sql.NullTime
}

func (s *Source) FetchIssuedLeaveRequests(academicYearID string) ([]SionLeaveRequest, error) {
	rows, err := s.db.Query(
		`select id, student_user_id, class_id, student_name_snapshot, class_name_snapshot, guardian_name_snapshot,
		        category, reason, start_date, end_date, issued_by_user_id, letter_number, issued_at
		 from student_leave_requests
		 where academic_year_id = ? and status = 'issued'`,
		academicYearID,
	)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []SionLeaveRequest
	for rows.Next() {
		var l SionLeaveRequest
		if err := rows.Scan(
			&l.ID, &l.StudentUserID, &l.ClassID, &l.StudentNameSnapshot, &l.ClassNameSnapshot, &l.GuardianNameSnapshot,
			&l.Category, &l.Reason, &l.StartDate, &l.EndDate, &l.IssuedByUserID, &l.LetterNumber, &l.IssuedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// CountPendingLeaveRequests reports how many leave requests for the year are
// still in flight (not issued, not rejected), purely so the report can name
// the size of the documented gap.
func (s *Source) CountPendingLeaveRequests(academicYearID string) (int, error) {
	var n int
	err := s.db.QueryRow(
		`select count(*) from student_leave_requests where academic_year_id = ? and status not in ('issued', 'rejected')`,
		academicYearID,
	).Scan(&n)
	return n, err
}

// CountExitPermits reports the total number of SION exit permits for the
// year. Exit permits are not migrated at all (see docs/13-etl-sion.md): they
// are single-day, single-use gate passes whose value is operational, not
// historical, and replaying them through the new workflow engine's
// one-per-day exclusion constraint and gate-token lifecycle is out of scope
// for this ETL.
func (s *Source) CountExitPermits(academicYearID string) (int, error) {
	var n int
	err := s.db.QueryRow(
		`select count(*) from student_exit_permits where academic_year_id = ?`,
		academicYearID,
	).Scan(&n)
	return n, err
}

// CountLateArrivals reports the total number of SION late-arrival records
// for the year. Like exit permits, late arrivals are not migrated: they are
// a same-day disciplinary workflow (call parent / send home) with no letter
// or long-term record, so there is nothing worth carrying into history.
func (s *Source) CountLateArrivals(academicYearID string) (int, error) {
	var n int
	err := s.db.QueryRow(
		`select count(*) from student_late_arrivals where academic_year_id = ?`,
		academicYearID,
	).Scan(&n)
	return n, err
}
