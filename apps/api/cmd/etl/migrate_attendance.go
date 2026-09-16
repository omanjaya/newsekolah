package main

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/cmd/etl/mapping"
)

// attendanceSessionResult resolves a source attendances.id to the target
// attendance_sessions.id and the target user id that recorded it (the
// actor, not necessarily the session's teacher_user_id -- see
// migrateAttendanceSessions), which migrateAttendanceEntries needs for each
// entry's recorded_by.
type attendanceSessionResult struct {
	targetSessionID uuid.UUID
	recordedByID    uuid.UUID
}

// migrateAttendanceSessions migrates attendances to attendance_sessions,
// keyed on the target's own (schedule_id, date) unique constraint.
// schedule_id resolves through the schedules IDMap the scheduling step
// already built: attendances.schedule_id is a live-schema schedules.id,
// exactly what that map is keyed on, so a schedule outside the
// schedule_version chosen for this run (see resolveScheduleVersion) fails
// here the same way an unmigrated class or subject would.
func (st *Store) migrateAttendanceSessions(
	ctx context.Context, tenantID, academicYearID uuid.UUID, sessions []SionAttendanceSession,
	schedules IDMap, users map[int64]userMigrationResult, classes map[int64]classMigrationResult,
	subjects IDMap, periods map[int64]periodMigrationResult, loc *time.Location, stat *TableStat,
) (map[int64]attendanceSessionResult, error) {
	result := make(map[int64]attendanceSessionResult, len(sessions))
	unresolvedSchedule := 0
	for _, a := range sessions {
		stat.Read++
		scheduleID, ok := schedules[a.ScheduleID]
		if !ok {
			unresolvedSchedule++
			stat.RecordFailure(fmt.Sprintf("%d", a.ID), "schedule not migrated (see schedules table failures, or belongs to a different schedule_version)")
			continue
		}
		class, ok := classes[a.ClassID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", a.ID), "class not migrated (see classes table failures)")
			continue
		}
		subjectID, ok := subjects[a.SubjectID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", a.ID), "subject not migrated (see subjects table failures)")
			continue
		}
		period, ok := periods[a.PeriodID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", a.ID), "period not migrated (see periods table failures)")
			continue
		}

		// The regularly assigned teacher is replaced_teacher_id when set
		// (the schedule's own teacher), with teacher_id then being the
		// substitute who actually took the session; otherwise teacher_id
		// is both the assigned teacher and the recorder.
		assignedTeacherSourceID := a.TeacherID
		var substituteUserID uuid.NullUUID
		if a.ReplacedTeacherID.Valid {
			assignedTeacherSourceID = a.ReplacedTeacherID.Int64
			substitute, ok := users[a.TeacherID]
			if !ok {
				stat.RecordFailure(fmt.Sprintf("%d", a.ID), "substitute teacher not migrated (see identity table failures)")
				continue
			}
			substituteUserID = uuid.NullUUID{UUID: substitute.targetUserID, Valid: true}
		}
		teacher, ok := users[assignedTeacherSourceID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", a.ID), "teacher not migrated (see identity table failures)")
			continue
		}
		recordedBy, ok := users[a.TeacherID]
		if !ok {
			recordedBy = teacher
		}

		date := mapping.LocalDate(a.AttendanceDate)
		var submittedAt any
		if a.CreatedAt.Valid {
			submittedAt = mapping.LocalToUTC(a.CreatedAt.Time, loc)
		}

		id, created, err := st.upsertOne(ctx,
			`insert into attendance_sessions (
			   tenant_id, academic_year_id, schedule_id, date, class_id, subject_id,
			   teacher_user_id, substitute_user_id, start_period_id, end_period_id,
			   submitted_at, submitted_by
			 ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10, $11)
			 on conflict (schedule_id, date) do update set
			   teacher_user_id = excluded.teacher_user_id, substitute_user_id = excluded.substitute_user_id,
			   submitted_at = excluded.submitted_at, submitted_by = excluded.submitted_by
			 returning id, (xmax = 0)`,
			tenantID, academicYearID, scheduleID, date, class.targetClassID, subjectID,
			teacher.targetUserID, substituteUserID, period.targetPeriodID, submittedAt, recordedBy.targetUserID,
		)
		if err != nil {
			stat.RecordFailure(fmt.Sprintf("%d", a.ID), fmt.Sprintf("upsert attendance session: %v", err))
			continue
		}
		if created {
			stat.Created++
		} else {
			stat.Updated++
		}
		result[a.ID] = attendanceSessionResult{targetSessionID: id, recordedByID: recordedBy.targetUserID}
	}
	if unresolvedSchedule > 0 {
		stat.RecordGap(fmt.Sprintf(
			"attendances: %d row(s) recorded against a schedule outside the schedule_version chosen for this run (a class's timetable was revised mid-semester but the revision's schedule_versions.status was never flipped to 'active' in the source) -- not migrated, following the same single-schedule_version rule teaching_assignments/schedules already use",
			unresolvedSchedule,
		))
	}
	return result, nil
}

// migrateAttendanceEntries migrates attendance_details to
// attendance_entries, keyed on the target's own (session_id,
// student_user_id) unique constraint. status_code translates through
// mapping.MapAttendanceStatus (the live schema's Indonesian words -> the
// default single-letter policy); an entry whose session failed to migrate,
// or whose status word this ETL does not recognise, is reported and
// skipped rather than guessed.
func (st *Store) migrateAttendanceEntries(
	ctx context.Context, tenantID uuid.UUID, entriesBySession map[int64][]SionAttendanceEntry,
	sessions map[int64]attendanceSessionResult, users map[int64]userMigrationResult, stat *TableStat,
) error {
	unrecognisedStatuses := make(map[string]int)
	for sourceSessionID, entries := range entriesBySession {
		session, ok := sessions[sourceSessionID]
		if !ok {
			for range entries {
				stat.Read++
				stat.RecordFailure(fmt.Sprintf("%d", sourceSessionID), "attendance session not migrated (see attendance_sessions table failures)")
			}
			continue
		}
		for _, e := range entries {
			stat.Read++
			student, ok := users[e.StudentID]
			if !ok {
				stat.RecordFailure(fmt.Sprintf("%d", e.ID), "student not migrated (see identity table failures)")
				continue
			}
			code, ok := mapping.MapAttendanceStatus(e.Status)
			if !ok {
				unrecognisedStatuses[e.Status]++
				stat.RecordFailure(fmt.Sprintf("%d", e.ID), fmt.Sprintf("unrecognised status %q", e.Status))
				continue
			}
			// "-" is the live app's own placeholder for "no note", written
			// by the client whenever the teacher left the field blank;
			// treated the same as an empty/absent note.
			notes := nullText(e.Notes)
			if notes.String == "-" {
				notes.String, notes.Valid = "", false
			}

			_, created, err := st.upsertOne(ctx,
				`insert into attendance_entries (tenant_id, session_id, student_user_id, status_code, source, notes, recorded_by)
				 values ($1, $2, $3, $4, 'teacher', $5, $6)
				 on conflict (session_id, student_user_id) do update set
				   status_code = excluded.status_code, notes = excluded.notes, recorded_by = excluded.recorded_by
				 returning id, (xmax = 0)`,
				tenantID, session.targetSessionID, student.targetUserID, code, notes, session.recordedByID,
			)
			if err != nil {
				stat.RecordFailure(fmt.Sprintf("%d", e.ID), fmt.Sprintf("upsert attendance entry: %v", err))
				continue
			}
			if created {
				stat.Created++
			} else {
				stat.Updated++
			}
		}
	}
	for word, count := range unrecognisedStatuses {
		stat.RecordGap(fmt.Sprintf("status %q: %d attendance_details row(s) skipped, no equivalent in the default attendance status policy", word, count))
	}
	return nil
}
