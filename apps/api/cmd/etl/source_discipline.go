package main

import "time"

// SionViolationType is one row of SION's violations table (the catalog, not
// a recorded incident -- confusingly named "violations" in SION, renamed
// violation_types in the new schema).
type SionViolationType struct {
	ID     string
	Name   string
	Points int
}

func (s *Source) FetchViolationTypes(academicYearID string) ([]SionViolationType, error) {
	rows, err := s.db.Query(`select id, name, points from violations where academic_year_id = ?`, academicYearID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []SionViolationType
	for rows.Next() {
		var v SionViolationType
		if err := rows.Scan(&v.ID, &v.Name, &v.Points); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// SionViolationRecord is one row of student_has_violations: one recorded
// incident.
type SionViolationRecord struct {
	ID             string
	StudentUserID  string
	ViolationID    string
	ReporterUserID string
	OccurredDate   time.Time
}

func (s *Source) FetchViolationRecords(academicYearID string) ([]SionViolationRecord, error) {
	rows, err := s.db.Query(
		`select id, student_user_id, violation_id, reporter_user_id, occurred_date
		 from student_has_violations where academic_year_id = ?`,
		academicYearID,
	)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []SionViolationRecord
	for rows.Next() {
		var v SionViolationRecord
		if err := rows.Scan(&v.ID, &v.StudentUserID, &v.ViolationID, &v.ReporterUserID, &v.OccurredDate); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// SionWarningLetter is one row of violation_warning_letters.
type SionWarningLetter struct {
	ID             string
	StudentUserID  string
	SPLevel        string // "SP 1", "SP 2", "SP 3"
	LetterNumber   string
	TotalPoints    int
	IssuedByUserID string
	IssuedAt       time.Time
}

func (s *Source) FetchWarningLetters(academicYearID string) ([]SionWarningLetter, error) {
	rows, err := s.db.Query(
		`select id, student_user_id, sp_level, letter_number, total_points, issued_by_user_id, issued_at
		 from violation_warning_letters where academic_year_id = ?`,
		academicYearID,
	)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []SionWarningLetter
	for rows.Next() {
		var w SionWarningLetter
		if err := rows.Scan(&w.ID, &w.StudentUserID, &w.SPLevel, &w.LetterNumber, &w.TotalPoints, &w.IssuedByUserID, &w.IssuedAt); err != nil {
			return nil, err
		}
		out = append(out, w)
	}
	return out, rows.Err()
}
