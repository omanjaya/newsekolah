package main

import (
	"database/sql"
	"time"
)

// SionJournal is one live-schema journals row. The live data only ever
// carries type='guru' (a teacher's class journal entry); 'siswa' and 'bk'
// are defined in the enum but unused at this school and have no equivalent
// in the target's class_journals table (which is teacher-only) -- see
// migrate_journal.go for how a non-'guru' row is handled if one ever
// appears.
type SionJournal struct {
	ID          int64
	UserID      int64
	ScheduleID  int64
	ClassID     int64 // from the schedule's own teacher_classes.group_id
	SubjectID   int64 // from the schedule's own teacher_classes.subject_id
	JournalDate time.Time
	Title       sql.NullString
	Content     string
	Type        string
}

// FetchJournals reads every journals row for classes belonging to the
// migrated year, scoped through schedules -> teacher_classes, mirroring
// FetchSchedules' own join path (schedules only names a teacher_class_id,
// and teacher_classes is what carries the group/subject/year). class_id and
// subject_id come from the schedule's own teacher_classes row rather than
// journals.user_id, since the live data's only journal type ('guru') can in
// principle be written by someone other than the class's own assigned
// teacher (a substitute); user_id is kept as both teacher_user_id and
// written_by_user_id in migrate_journal.go, since the schema does not
// distinguish the two.
func (s *Source) FetchJournals(scheduleVersionID int64) ([]SionJournal, error) {
	rows, err := s.db.Query(
		`select j.id, j.user_id, j.schedule_id, tc.group_id, tc.subject_id,
		        j.journal_date, j.title, j.content, j.type
		 from journals j
		 join schedules sch on sch.id = j.schedule_id
		 join teacher_classes tc on tc.id = sch.teacher_class_id
		 where tc.schedule_version_id = ?
		 order by j.id`,
		scheduleVersionID,
	)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []SionJournal
	for rows.Next() {
		var j SionJournal
		if err := rows.Scan(
			&j.ID, &j.UserID, &j.ScheduleID, &j.ClassID, &j.SubjectID,
			&j.JournalDate, &j.Title, &j.Content, &j.Type,
		); err != nil {
			return nil, err
		}
		out = append(out, j)
	}
	return out, rows.Err()
}
