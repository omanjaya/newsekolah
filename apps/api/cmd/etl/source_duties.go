package main

// SionClassAdministrator is one live-schema class_administrators row: the
// homeroom teacher for one class in the migrated year. This is the precise
// source for the "homeroom" duty -- see migrate_duties.go -- rather than the
// "Class Administrator" Spatie role, which names the same people less
// precisely (no per-class detail) and is deliberately ignored.
type SionClassAdministrator struct {
	ClassID int64
	UserID  int64
}

func (s *Source) FetchClassAdministrators(yearID int64) ([]SionClassAdministrator, error) {
	rows, err := s.db.Query(
		`select ca.group_id, ca.user_id
		 from class_administrators ca
		 join groups g on g.id = ca.group_id
		 where g.year_id = ?`,
		yearID,
	)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []SionClassAdministrator
	for rows.Next() {
		var ca SionClassAdministrator
		if err := rows.Scan(&ca.ClassID, &ca.UserID); err != nil {
			return nil, err
		}
		out = append(out, ca)
	}
	return out, rows.Err()
}

// CountClassOfBKAssignments reports how many class-level BK counselor
// assignments (class_of_bks) exist for the migrated year. Not migrated in
// detail: the target's counselor duty type is school-scoped
// (duty_types.scope_kind = 'school'), so there is nowhere to attach a
// per-class assignment -- this is reported as a gap instead.
func (s *Source) CountClassOfBKAssignments(yearID int64) (int, error) {
	var n int
	err := s.db.QueryRow(
		`select count(*) from class_of_bks cb join groups g on g.id = cb.group_id where g.year_id = ?`,
		yearID,
	).Scan(&n)
	return n, err
}

// CountBKOnDutyRecords reports how many bk_on_dutis rows exist (which
// weekday each BK counselor is on duty). Not migrated: duty_assignments has
// no day-of-week column. The source table carries no year reference, so
// this counts every row rather than filtering by year.
func (s *Source) CountBKOnDutyRecords() (int, error) {
	var n int
	err := s.db.QueryRow(`select count(*) from bk_on_dutis`).Scan(&n)
	return n, err
}
