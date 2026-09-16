package main

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/cmd/etl/mapping"
)

// classJournalTopicMaxLen matches class_journals' own
// `check (length(topic) <= 300)`.
const classJournalTopicMaxLen = 300

// migrateJournals migrates journals to class_journals, keyed on the
// target's own (academic_year_id, teacher_user_id, class_id, subject_id,
// lesson_date) unique constraint. The live schema has no separate "topic"
// field (journals.title is always empty at this school) and no plain-text
// body: content is one HTML-wrapped paragraph from the source's editor, so
// mapping.StripHTMLTags produces both topic (truncated to 300 chars) and
// the full activities text. Every source row is type='guru' in this
// school's data; a 'siswa' or 'bk' row -- defined in the source enum but
// never seen here -- is reported as a gap rather than guessed at, since
// class_journals is teacher-only in the target schema.
func (st *Store) migrateJournals(
	ctx context.Context, tenantID, academicYearID uuid.UUID, journals []SionJournal,
	users map[int64]userMigrationResult, classes map[int64]classMigrationResult, subjects IDMap,
	sessions map[int64]attendanceSessionResult, stat *TableStat,
) error {
	nonTeacherCount := 0
	for _, j := range journals {
		stat.Read++
		if j.Type != "guru" {
			nonTeacherCount++
			continue
		}
		teacher, ok := users[j.UserID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", j.ID), "teacher not migrated (see identity table failures)")
			continue
		}
		class, ok := classes[j.ClassID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", j.ID), "class not migrated (see classes table failures)")
			continue
		}
		subjectID, ok := subjects[j.SubjectID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", j.ID), "subject not migrated (see subjects table failures)")
			continue
		}

		plainText := mapping.StripHTMLTags(j.Content)
		topic := mapping.CleanName(j.Title.String)
		if topic == "" {
			topic = mapping.Truncate(plainText, classJournalTopicMaxLen)
		}
		if topic == "" {
			topic = "(tanpa judul)"
		}

		var attendanceSessionID uuid.NullUUID
		if session, ok := sessions[j.ScheduleID]; ok {
			attendanceSessionID = uuid.NullUUID{UUID: session.targetSessionID, Valid: true}
		}

		lessonDate := mapping.LocalDate(j.JournalDate)
		existingID, found, err := st.selectID(ctx,
			`select id from class_journals
			 where academic_year_id = $1 and teacher_user_id = $2 and class_id = $3 and subject_id = $4 and lesson_date = $5`,
			academicYearID, teacher.targetUserID, class.targetClassID, subjectID, lessonDate,
		)
		if err != nil {
			stat.RecordFailure(fmt.Sprintf("%d", j.ID), fmt.Sprintf("lookup class journal: %v", err))
			continue
		}
		if found {
			if err := st.execRow(ctx,
				`update class_journals set topic = $1, activities = $2, attendance_session_id = $3 where id = $4`,
				topic, plainText, attendanceSessionID, existingID,
			); err != nil {
				stat.RecordFailure(fmt.Sprintf("%d", j.ID), fmt.Sprintf("update class journal: %v", err))
				continue
			}
			stat.Updated++
			continue
		}

		if err := st.execRow(ctx,
			`insert into class_journals (
			   tenant_id, academic_year_id, teacher_user_id, written_by_user_id, class_id, subject_id,
			   lesson_date, topic, activities, attendance_session_id
			 ) values ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9)`,
			tenantID, academicYearID, teacher.targetUserID, class.targetClassID, subjectID,
			lessonDate, topic, plainText, attendanceSessionID,
		); err != nil {
			stat.RecordFailure(fmt.Sprintf("%d", j.ID), fmt.Sprintf("create class journal: %v", err))
			continue
		}
		stat.Created++
	}
	if nonTeacherCount > 0 {
		stat.RecordGap(fmt.Sprintf("journals: %d non-'guru' row(s) (type siswa/bk) have no equivalent -- class_journals is teacher-only in the target schema", nonTeacherCount))
	}
	return nil
}
