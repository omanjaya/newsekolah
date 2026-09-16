package main

// SionClass is one live-schema groups row (a class) for one migrated year.
// groups.code is a random opaque string with no meaning; only name (e.g.
// "X-1", "XI-12") is used, parsed the same way as before by
// mapping.ParseGradeFromClassName. groups.status is ignored: it is always 1
// in the live data, and even where it is not, every group for the year is
// still migrated (status is not a filter here).
type SionClass struct {
	ID   int64
	Name string
}

func (s *Source) FetchClasses(yearID int64) ([]SionClass, error) {
	rows, err := s.db.Query(`select id, name from groups where year_id = ? order by name`, yearID)
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

// SionSubject is one live-schema subjects row. Unlike the old SION-rewrite
// schema, subjects are global, not scoped to an academic year.
type SionSubject struct {
	ID   int64
	Name string
}

func (s *Source) FetchSubjects() ([]SionSubject, error) {
	rows, err := s.db.Query(`select id, name from subjects order by name`)
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

// SionRoom is one live-schema rooms row, also global. The live database
// currently has zero rows -- nothing in the schema even references a
// room_id -- but the query is implemented for schools whose dump does have
// rooms.
type SionRoom struct {
	ID   int64
	Name string
}

func (s *Source) FetchRooms() ([]SionRoom, error) {
	rows, err := s.db.Query(`select id, name from rooms order by name`)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []SionRoom
	for rows.Next() {
		var r SionRoom
		if err := rows.Scan(&r.ID, &r.Name); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// SionEnrollment is one live-schema group_members row: which class a
// student belongs to for the migrated year. Unlike the old SION-rewrite
// schema there is no status/joined_at/left_at column at all -- every
// enrollment defaults to status=active with no end date, see
// migrateEnrollments.
type SionEnrollment struct {
	StudentUserID int64
	ClassID       int64
}

func (s *Source) FetchEnrollments(yearID int64) ([]SionEnrollment, error) {
	rows, err := s.db.Query(
		`select gm.user_id, gm.group_id
		 from group_members gm
		 join groups g on g.id = gm.group_id
		 where g.year_id = ?`,
		yearID,
	)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []SionEnrollment
	for rows.Next() {
		var e SionEnrollment
		if err := rows.Scan(&e.StudentUserID, &e.ClassID); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// SionTeachingAssignment is one live-schema teacher_classes row: a
// teacher's assignment to teach one subject to one class, scoped to one
// schedule_version (a migrated year can have several, see
// SionScheduleVersion in source_schedule.go). There is no is_active column
// -- every row is a live assignment. ID is teacher_classes.id itself, which
// source_schedule.go's schedules query needs to resolve a schedule row's
// teacher/class/subject (schedules only carries a teacher_class_id, not
// those three directly).
type SionTeachingAssignment struct {
	ID            int64
	TeacherUserID int64
	ClassID       int64
	SubjectID     int64
}

// FetchTeachingAssignments reads every teacher_classes row for every
// schedule_version passed. The target's own teaching_assignments table
// keys on (academic_year_id, teacher_user_id, subject_id, class_id) --
// nothing per-revision -- so assignments from more than one version simply
// upsert onto the same target row rather than conflicting.
func (s *Source) FetchTeachingAssignments(scheduleVersionIDs []int64) ([]SionTeachingAssignment, error) {
	placeholders, args := int64InClause(scheduleVersionIDs)
	rows, err := s.db.Query(
		//nolint:gosec // placeholders is a "?,?,..." run built from len(scheduleVersionIDs), never from external input; the ids themselves are bound as args
		`select id, user_id, group_id, subject_id from teacher_classes where schedule_version_id in (`+placeholders+`)`,
		args...,
	)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []SionTeachingAssignment
	for rows.Next() {
		var a SionTeachingAssignment
		if err := rows.Scan(&a.ID, &a.TeacherUserID, &a.ClassID, &a.SubjectID); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// IndexTeachingAssignmentsByID builds a teacher_classes.id lookup, which
// source_schedule.go's schedules query needs since a schedule row only
// carries a teacher_class_id, not the teacher/class/subject directly.
func IndexTeachingAssignmentsByID(assignments []SionTeachingAssignment) map[int64]SionTeachingAssignment {
	idx := make(map[int64]SionTeachingAssignment, len(assignments))
	for _, a := range assignments {
		idx[a.ID] = a
	}
	return idx
}
