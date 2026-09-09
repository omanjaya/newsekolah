package main

// SionPeriod is one row of SION's periods table for the selected year.
// SION scopes periods per academic year directly; the new schema groups
// them into a named period_template shared across years, so the ETL creates
// one template per migrated year (see migrate_schedule.go).
type SionPeriod struct {
	ID        string
	Name      string
	StartTime string // TIME, e.g. "07:00:00"
	EndTime   string
	Sequence  int
}

func (s *Source) FetchPeriods(academicYearID string) ([]SionPeriod, error) {
	rows, err := s.db.Query(
		`select id, name, start_time, end_time, sort_order from periods where academic_year_id = ? order by sort_order`,
		academicYearID,
	)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []SionPeriod
	for rows.Next() {
		var p SionPeriod
		if err := rows.Scan(&p.ID, &p.Name, &p.StartTime, &p.EndTime, &p.Sequence); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// SionTeachingSchedule is one row of teaching_schedules: a recurring weekly
// slot for a class/subject/teacher.
type SionTeachingSchedule struct {
	ID            string
	DayOfWeek     string
	ClassID       string
	TeacherUserID string
	SubjectID     string
	StartPeriodID string
	EndPeriodID   string
}

func (s *Source) FetchTeachingSchedules(academicYearID string) ([]SionTeachingSchedule, error) {
	rows, err := s.db.Query(
		`select id, day_of_week, class_id, teacher_user_id, subject_id, start_period_id, end_period_id
		 from teaching_schedules where academic_year_id = ?`,
		academicYearID,
	)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []SionTeachingSchedule
	for rows.Next() {
		var t SionTeachingSchedule
		if err := rows.Scan(&t.ID, &t.DayOfWeek, &t.ClassID, &t.TeacherUserID, &t.SubjectID, &t.StartPeriodID, &t.EndPeriodID); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}
