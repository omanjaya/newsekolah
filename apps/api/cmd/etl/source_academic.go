package main

import "database/sql"

// SionClass is one row of SION's classes table for the selected academic
// year. SION has no grade_levels table: the grade is parsed from the class
// name by mapping.ParseGradeFromClassName.
type SionClass struct {
	ID   string
	Name string
}

func (s *Source) FetchClasses(academicYearID string) ([]SionClass, error) {
	rows, err := s.db.Query(`select id, name from classes where academic_year_id = ? order by name`, academicYearID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []SionClass
	for rows.Next() {
		var c SionClass
		if err := rows.Scan(&c.ID, &c.Name); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// SionSubject is one row of SION's subjects table for the selected year.
type SionSubject struct {
	ID   string
	Name string
}

func (s *Source) FetchSubjects(academicYearID string) ([]SionSubject, error) {
	rows, err := s.db.Query(`select id, name from subjects where academic_year_id = ? order by name`, academicYearID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []SionSubject
	for rows.Next() {
		var sub SionSubject
		if err := rows.Scan(&sub.ID, &sub.Name); err != nil {
			return nil, err
		}
		out = append(out, sub)
	}
	return out, rows.Err()
}

// SionEnrollment is one row of student_class_assignments: which class a
// student belongs to for the selected year, and since when.
type SionEnrollment struct {
	StudentUserID string
	ClassID       string
	Status        string
	JoinedAt      sql.NullTime
	LeftAt        sql.NullTime
}

func (s *Source) FetchEnrollments(academicYearID string) ([]SionEnrollment, error) {
	rows, err := s.db.Query(
		`select student_user_id, class_id, status, joined_at, left_at
		 from student_class_assignments where academic_year_id = ?`,
		academicYearID,
	)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []SionEnrollment
	for rows.Next() {
		var e SionEnrollment
		if err := rows.Scan(&e.StudentUserID, &e.ClassID, &e.Status, &e.JoinedAt, &e.LeftAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// SionTeachingAssignment is one row of teacher_subject_assignments.
type SionTeachingAssignment struct {
	TeacherUserID string
	SubjectID     string
	ClassID       string
	IsActive      bool
}

func (s *Source) FetchTeachingAssignments(academicYearID string) ([]SionTeachingAssignment, error) {
	rows, err := s.db.Query(
		`select teacher_user_id, subject_id, class_id, is_active
		 from teacher_subject_assignments where academic_year_id = ?`,
		academicYearID,
	)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []SionTeachingAssignment
	for rows.Next() {
		var a SionTeachingAssignment
		if err := rows.Scan(&a.TeacherUserID, &a.SubjectID, &a.ClassID, &a.IsActive); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// SionDutyAssignment unifies teacher_duty_assignments and
// employee_duty_assignments (both additional-duty tables share the same
// shape) so migrate_identity.go can treat them the same way. ScopeClassID is
// only populated for teacher duties scoped to one class (scope_type =
// 'class'), which is how SION records a homeroom teacher.
type SionDutyAssignment struct {
	UserID       string
	DutyName     string
	IsActive     bool
	ScopeClassID sql.NullString
}

func (s *Source) FetchTeacherDutyAssignments(academicYearID string) ([]SionDutyAssignment, error) {
	return s.fetchDutyAssignments(
		`select tda.teacher_user_id, tad.name, tda.is_active,
		        case when tda.scope_type = 'class' then tda.scope_id else null end
		 from teacher_duty_assignments tda
		 join teacher_additional_duties tad on tad.id = tda.duty_id
		 where tda.academic_year_id = ?`,
		academicYearID,
	)
}

func (s *Source) FetchEmployeeDutyAssignments(academicYearID string) ([]SionDutyAssignment, error) {
	return s.fetchDutyAssignments(
		`select eda.employee_user_id, ead.name, eda.is_active, null
		 from employee_duty_assignments eda
		 join employee_additional_duties ead on ead.id = eda.duty_id
		 where eda.academic_year_id = ?`,
		academicYearID,
	)
}

func (s *Source) fetchDutyAssignments(query, academicYearID string) ([]SionDutyAssignment, error) {
	rows, err := s.db.Query(query, academicYearID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []SionDutyAssignment
	for rows.Next() {
		var d SionDutyAssignment
		if err := rows.Scan(&d.UserID, &d.DutyName, &d.IsActive, &d.ScopeClassID); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}
