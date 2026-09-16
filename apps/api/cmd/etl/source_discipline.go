package main

import "database/sql"

// SionViolationType is one live-schema violations row: a catalog entry
// (name, code, point value) a student's infraction is recorded against.
// Global, not scoped to an academic year.
type SionViolationType struct {
	ID       int64
	Name     string
	Code     string
	Points   int
	IsActive bool
}

func (s *Source) FetchViolationTypes() ([]SionViolationType, error) {
	rows, err := s.db.Query(`select id, violation_name, violation_code, violation_poin, status from violations order by id`)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []SionViolationType
	for rows.Next() {
		var v SionViolationType
		var status string
		if err := rows.Scan(&v.ID, &v.Name, &v.Code, &v.Points, &status); err != nil {
			return nil, err
		}
		v.IsActive = status == "active"
		out = append(out, v)
	}
	return out, rows.Err()
}

// SionViolationRecord is one live-schema student_has_violations row: one
// student's recorded infraction, with the points it carried at the time
// (the source keeps no separate historical points column -- points_snapshot
// in the target is filled from the violation type's current point value,
// see migrate_discipline.go).
type SionViolationRecord struct {
	ID          int64
	StudentID   int64
	ViolationID int64
	ReporterID  sql.NullInt64
	ExtraNote   sql.NullString
	IsSentHome  bool
	CreatedAt   sql.NullTime
}

// FetchViolationRecords reads every student_has_violations row for the
// migrated year.
func (s *Source) FetchViolationRecords(yearID int64) ([]SionViolationRecord, error) {
	rows, err := s.db.Query(
		`select id, user_id, violation_id, reporter_id, extra_note, is_sent_home, created_at
		 from student_has_violations
		 where year_id = ?
		 order by id`,
		yearID,
	)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []SionViolationRecord
	for rows.Next() {
		var v SionViolationRecord
		if err := rows.Scan(&v.ID, &v.StudentID, &v.ViolationID, &v.ReporterID, &v.ExtraNote, &v.IsSentHome, &v.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// CountSuspensions reports how many suspensions rows exist for the migrated
// year. Not migrated in detail: the target schema has no suspension entity
// (in-school/out-of-school suspension is not modelled separately from
// violation_records/warning_letters) -- see docs/13-etl-sion.md.
func (s *Source) CountSuspensions(yearID int64) (int, error) {
	var n int
	err := s.db.QueryRow(`select count(*) from suspensions where year_id = ?`, yearID).Scan(&n)
	return n, err
}
