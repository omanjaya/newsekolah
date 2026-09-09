package main

import "database/sql"

// SionUser is one row of SION's users table joined with the role it holds
// (model_has_roles) and its optional user_details / *_details rows.
// Identity is global in SION (not scoped to an academic year), so the ETL
// migrates every user regardless of which year was selected.
type SionUser struct {
	ID       string
	Name     string
	Username string
	Email    sql.NullString
	Status   string
	RoleID   sql.NullString // model_has_roles.role_id; a user can hold at most one in SION's schema

	// user_details
	NIK        sql.NullString
	Gender     sql.NullString
	BirthPlace sql.NullString
	BirthDate  sql.NullTime
	Religion   sql.NullString
	Address    sql.NullString
	District   sql.NullString
	City       sql.NullString
	Phone      sql.NullString

	// student_details
	NIS              sql.NullString
	NISN             sql.NullString
	EntryYear        sql.NullInt64
	FatherName       sql.NullString
	MotherName       sql.NullString
	GuardianName     sql.NullString
	GuardianPhone    sql.NullString
	ParentOccupation sql.NullString
	PreviousSchool   sql.NullString

	// teacher_details
	NIP                     sql.NullString
	NUPTK                   sql.NullString
	TeacherLastEducation    sql.NullString
	TeacherEmploymentStatus sql.NullString
	TeacherJoinedYear       sql.NullInt64
	TeachingSpecialization  sql.NullString

	// employee_details
	EmployeeNumber           sql.NullString
	EmployeePosition         sql.NullString
	EmployeeLastEducation    sql.NullString
	EmployeeEmploymentStatus sql.NullString
	EmployeeJoinedYear       sql.NullInt64
}

const sionUsersQuery = `
select
  u.id, u.name, u.username, u.email, u.status,
  mhr.role_id,
  ud.nik, ud.gender, ud.birth_place, ud.birth_date, ud.religion, ud.address, ud.district, ud.city, ud.phone,
  sd.nis, sd.nisn, sd.entry_year, sd.father_name, sd.mother_name, sd.guardian_name, sd.guardian_phone,
  sd.parent_occupation, sd.previous_school,
  td.nip, td.nuptk, td.last_education, td.employment_status, td.joined_year, td.teaching_specialization,
  ed.employee_number, ed.position, ed.last_education, ed.employment_status, ed.joined_year
from users u
left join model_has_roles mhr on mhr.user_id = u.id
left join user_details ud on ud.user_id = u.id
left join student_details sd on sd.user_id = u.id
left join teacher_details td on td.user_id = u.id
left join employee_details ed on ed.user_id = u.id
order by u.id
`

// FetchUsers reads every user in the SION database with its role and
// per-kind detail row, if any.
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
			&u.ID, &u.Name, &u.Username, &u.Email, &u.Status,
			&u.RoleID,
			&u.NIK, &u.Gender, &u.BirthPlace, &u.BirthDate, &u.Religion, &u.Address, &u.District, &u.City, &u.Phone,
			&u.NIS, &u.NISN, &u.EntryYear, &u.FatherName, &u.MotherName, &u.GuardianName, &u.GuardianPhone,
			&u.ParentOccupation, &u.PreviousSchool,
			&u.NIP, &u.NUPTK, &u.TeacherLastEducation, &u.TeacherEmploymentStatus, &u.TeacherJoinedYear, &u.TeachingSpecialization,
			&u.EmployeeNumber, &u.EmployeePosition, &u.EmployeeLastEducation, &u.EmployeeEmploymentStatus, &u.EmployeeJoinedYear,
		); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}
