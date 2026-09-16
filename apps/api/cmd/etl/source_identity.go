package main

import "database/sql"

// SionUser is one live-schema users row joined with its optional
// user_details / student_details rows (both LEFT JOINs: most staff have a
// user_details row, most students have a student_details row, and a user
// can lack both). "Sion" is kept as the struct prefix for continuity with
// the rest of this package, even though the source is now the live Laravel
// application, not the retired Go rewrite. Identity is global (not scoped
// to an academic year), so every user is migrated regardless of which year
// was selected. Role names and management_staff position are fetched
// separately (FetchUserRoles, FetchManagementStaff) since a user can hold
// several Spatie roles and a per-user LEFT JOIN would multiply this query's
// other joined rows.
type SionUser struct {
	ID       int64
	Name     string
	Email    string
	Username string
	Status   int

	// user_details: sparse, roughly the non-student users (~91 of 2518
	// rows). no_id is a generic "identity number" column -- it doubles as
	// user_profiles.nik for every kind, and additionally as
	// teacher_profiles.nip / staff_profiles.employee_number, see
	// upsertProfile.
	NoID          sql.NullString
	Address       sql.NullString
	ContactNumber sql.NullString // -> users.phone

	// student_details: present for 2415 of 2429 students.
	NIS               sql.NullString
	NISN              sql.NullString
	StudentBirthPlace sql.NullString
	StudentBirthDate  sql.NullTime
	StudentAddress    sql.NullString // fallback for user_profiles.address when user_details has none
}

const sionUsersQuery = `
select
  u.id, u.name, u.email, u.username, u.status,
  ud.no_id, ud.address, ud.contact_number,
  sd.nis, sd.nisn, sd.birth_place, sd.birth_date, sd.address
from users u
left join user_details ud on ud.user_id = u.id
left join student_details sd on sd.user_id = u.id
order by u.id
`

// FetchUsers reads every user in the live database with its optional
// user_details / student_details row.
func (s *Source) FetchUsers() ([]SionUser, error) {
	rows, err := s.db.Query(sionUsersQuery)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	var out []SionUser
	for rows.Next() {
		var u SionUser
		if err := rows.Scan(
			&u.ID, &u.Name, &u.Email, &u.Username, &u.Status,
			&u.NoID, &u.Address, &u.ContactNumber,
			&u.NIS, &u.NISN, &u.StudentBirthPlace, &u.StudentBirthDate, &u.StudentAddress,
		); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// FetchUserRoles reads every (user, Spatie role name) pair from the live
// schema's model_has_roles/roles tables into one map, since a user can hold
// several roles at once.
func (s *Source) FetchUserRoles() (map[int64][]string, error) {
	rows, err := s.db.Query(
		`select mhr.model_id, r.name
		 from model_has_roles mhr
		 join roles r on r.id = mhr.role_id
		 where mhr.model_type = ?`,
		`App\Models\User`,
	)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	out := make(map[int64][]string)
	for rows.Next() {
		var userID int64
		var role string
		if err := rows.Scan(&userID, &role); err != nil {
			return nil, err
		}
		out[userID] = append(out[userID], role)
	}
	return out, rows.Err()
}

// FetchManagementStaff reads the live schema's small management_staff table
// (4 rows, all "Waka ..." deputy-head positions): the source for the
// "leadership" duty and for staff_profiles.position on that user, see
// migrate_duties.go and upsertProfile.
func (s *Source) FetchManagementStaff() (map[int64]string, error) {
	rows, err := s.db.Query(`select user_id, position from management_staff`)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	out := make(map[int64]string)
	for rows.Next() {
		var userID int64
		var position string
		if err := rows.Scan(&userID, &position); err != nil {
			return nil, err
		}
		out[userID] = position
	}
	return out, rows.Err()
}
