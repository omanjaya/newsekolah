package main

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/cmd/etl/mapping"
)

// scheduleResolution is what buildScheduleUnion (migrate_schedule.go) hands
// migrateAttendanceSessions: the target schedule id for each class/weekday/
// period slot in the migrated timetable, the source revision that slot's
// schedule came from, and, separately, which revision each raw source
// schedule row (attendances.schedule_id) itself belonged to -- the last one
// lets a session's own named schedule be compared against the one it
// actually attaches to, so a re-point (see migrateAttendanceSessions) can
// be counted rather than passing unnoticed.
type scheduleResolution struct {
	targetBySlot   map[mapping.ScheduleSlot]uuid.UUID
	versionBySlot  map[mapping.ScheduleSlot]int64
	versionBySchID map[int64]int64
}

// resolveSessionSchedule finds one attendance session's target schedule by
// its own class/weekday/period slot (see migrateAttendanceSessions) and
// reports whether that schedule came from a different source revision than
// the one attendances.schedule_id itself named.
func resolveSessionSchedule(a SionAttendanceSession, resolution scheduleResolution) (scheduleID uuid.UUID, weekday int16, repointed, found bool) {
	weekday = mapping.WeekdayFromDate(mapping.LocalDate(a.AttendanceDate))
	slot := mapping.ScheduleSlot{ClassID: a.ClassID, Weekday: weekday, PeriodID: a.PeriodID}
	scheduleID, found = resolution.targetBySlot[slot]
	if !found {
		return uuid.Nil, weekday, false, false
	}
	namedVersion, known := resolution.versionBySchID[a.ScheduleID]
	repointed = !known || namedVersion != resolution.versionBySlot[slot]
	return scheduleID, weekday, repointed, true
}

// sessionTeacherResolution is the outcome of the "guru vs pengganti" rule
// migrateAttendanceSessions applies (see resolveSessionTeacher), already
// resolved against already-migrated users.
type sessionTeacherResolution struct {
	teacherUserID    uuid.UUID
	substituteUserID uuid.NullUUID
	recordedByID     uuid.UUID
}

// resolveSessionTeacher applies the source's own substitution rule: the
// regularly assigned teacher is replaced_teacher_id when set (the
// schedule's own teacher), with teacher_id then being the substitute who
// actually took the session; otherwise teacher_id is both the assigned
// teacher and the recorder. ok is false when a referenced user has not
// migrated, with reason naming which one for the caller's failure report.
func resolveSessionTeacher(a SionAttendanceSession, users map[int64]userMigrationResult) (result sessionTeacherResolution, reason string, ok bool) {
	assignedTeacherSourceID := a.TeacherID
	var substituteUserID uuid.NullUUID
	if a.ReplacedTeacherID.Valid {
		assignedTeacherSourceID = a.ReplacedTeacherID.Int64
		substitute, found := users[a.TeacherID]
		if !found {
			return sessionTeacherResolution{}, "substitute teacher not migrated (see identity table failures)", false
		}
		substituteUserID = uuid.NullUUID{UUID: substitute.targetUserID, Valid: true}
	}
	teacher, found := users[assignedTeacherSourceID]
	if !found {
		return sessionTeacherResolution{}, "teacher not migrated (see identity table failures)", false
	}
	recordedBy, found := users[a.TeacherID]
	if !found {
		recordedBy = teacher
	}
	return sessionTeacherResolution{
		teacherUserID:    teacher.targetUserID,
		substituteUserID: substituteUserID,
		recordedByID:     recordedBy.targetUserID,
	}, "", true
}

// buildScheduleResolution assembles a scheduleResolution from
// buildScheduleUnion's own result: rawSchedules is every schedule row
// fetched across every schedule_versions revision for the year (not just
// the union's winners, so a session's own attendances.schedule_id can still
// be traced back to the revision it named even when that revision lost its
// slot), winningScheduleIDBySlot is buildScheduleUnion's second return
// value, and scheduleIDs is migrateSchedules' own IDMap (winning source
// schedule id -> target schedule id).
func buildScheduleResolution(rawSchedules []SionSchedule, winningScheduleIDBySlot map[mapping.ScheduleSlot]int64, scheduleIDs IDMap) scheduleResolution {
	versionBySchID := make(map[int64]int64, len(rawSchedules))
	for _, sch := range rawSchedules {
		versionBySchID[sch.ID] = sch.VersionID
	}

	targetBySlot := make(map[mapping.ScheduleSlot]uuid.UUID, len(winningScheduleIDBySlot))
	versionBySlot := make(map[mapping.ScheduleSlot]int64, len(winningScheduleIDBySlot))
	for slot, rawID := range winningScheduleIDBySlot {
		if targetID, ok := scheduleIDs[rawID]; ok {
			targetBySlot[slot] = targetID
		}
		versionBySlot[slot] = versionBySchID[rawID]
	}

	return scheduleResolution{targetBySlot: targetBySlot, versionBySlot: versionBySlot, versionBySchID: versionBySchID}
}

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
//
// attendances.schedule_id is not used to resolve the target schedule: the
// live source lets a class's timetable be revised mid-semester without ever
// flipping the new revision's schedule_versions.status to 'active', which
// used to make every attendance session recorded against it fail to
// migrate (see docs/13-etl-sion.md "Union jadwal" and "Presensi" for the
// concrete numbers). Instead each session resolves through its own class,
// weekday (derived from its date), and period -- what the lesson actually
// was -- against resolution.targetBySlot, the single unioned timetable
// buildScheduleUnion built out of every revision for this year. A session
// whose slot was reassigned to a different revision after it was recorded
// still attaches to the schedule that survived for that slot (the lesson
// did happen at that class and time); repointedCount tracks how often that
// happens so it is visible in the report rather than silently absorbed.
func (st *Store) migrateAttendanceSessions(
	ctx context.Context, tenantID, academicYearID uuid.UUID, sessions []SionAttendanceSession,
	resolution scheduleResolution, users map[int64]userMigrationResult, classes map[int64]classMigrationResult,
	subjects IDMap, periods map[int64]periodMigrationResult, loc *time.Location, stat *TableStat,
) (map[int64]attendanceSessionResult, error) {
	result := make(map[int64]attendanceSessionResult, len(sessions))
	unresolvedSlot := 0
	repointedCount := 0
	for _, a := range sessions {
		stat.Read++
		scheduleID, weekday, repointed, found := resolveSessionSchedule(a, resolution)
		if !found {
			unresolvedSlot++
			stat.RecordFailure(fmt.Sprintf("%d", a.ID), fmt.Sprintf(
				"no schedule for class %d, weekday %d, period %d in any timetable revision migrated for this year",
				a.ClassID, weekday, a.PeriodID,
			))
			continue
		}
		if repointed {
			repointedCount++
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

		sessionTeacher, reason, ok := resolveSessionTeacher(a, users)
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", a.ID), reason)
			continue
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
			sessionTeacher.teacherUserID, sessionTeacher.substituteUserID, period.targetPeriodID, submittedAt, sessionTeacher.recordedByID,
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
		result[a.ID] = attendanceSessionResult{targetSessionID: id, recordedByID: sessionTeacher.recordedByID}
	}
	if unresolvedSlot > 0 {
		stat.RecordGap(fmt.Sprintf(
			"attendances: %d row(s) could not be matched to any migrated schedule by class/weekday/period -- likely a class, period, or teaching assignment that itself failed to migrate (see the relevant table's failures)",
			unresolvedSlot,
		))
	}
	if repointedCount > 0 {
		stat.RecordGap(fmt.Sprintf(
			"attendances: %d row(s) attached to a schedule from a timetable revision different than the one the source itself named (a later revision replaced that class/weekday/period slot; the session is kept against the schedule that actually survived for that slot, per docs/13-etl-sion.md \"Union jadwal\")",
			repointedCount,
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
