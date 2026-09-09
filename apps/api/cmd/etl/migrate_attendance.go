package main

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/cmd/etl/mapping"
)

// attendanceLookups bundles the id maps every attendance row needs to
// resolve, purely to keep migrateAttendanceSessions's parameter list (and
// cyclomatic complexity) down.
type attendanceLookups struct {
	users     map[string]userMigrationResult
	classes   map[string]classMigrationResult
	subjects  map[string]uuid.UUID
	periods   map[string]periodMigrationResult
	schedules map[string]scheduleMigrationResult
}

// migrateAttendance migrates attendance_sessions and, for each session that
// migrates successfully, its attendance_entries. Sessions key on the
// target's own `unique (schedule_id, date)`, identical to SION's
// `unique_attendance_session_schedule_date`. Entries key on `unique
// (session_id, student_user_id)`, identical to SION's
// `unique_attendance_entry_student`.
func (st *Store) migrateAttendance(
	ctx context.Context, tenantID uuid.UUID,
	sessions []SionAttendanceSession, entries []SionAttendanceEntry, lookups attendanceLookups,
	sessionStat, entryStat *TableStat,
) {
	sessionIDs := st.migrateAttendanceSessions(ctx, tenantID, sessions, lookups, sessionStat)
	st.migrateAttendanceEntries(ctx, tenantID, entries, sessionIDs, lookups.users, entryStat)
}

func (st *Store) migrateAttendanceSessions(
	ctx context.Context, tenantID uuid.UUID, sessions []SionAttendanceSession, l attendanceLookups, stat *TableStat,
) map[string]uuid.UUID {
	sessionIDs := make(map[string]uuid.UUID, len(sessions))
	for _, sess := range sessions {
		stat.Read++
		resolved, ok := l.resolveSession(sess)
		if !ok {
			stat.RecordFailure(sess.ID, resolved.failureReason)
			continue
		}

		id, created, err := st.upsertOne(ctx,
			`insert into attendance_sessions (
			   tenant_id, academic_year_id, schedule_id, date, class_id, subject_id, teacher_user_id, start_period_id, end_period_id
			 ) select $1, academic_year_id, $2, $3, $4, $5, $6, $7, $8 from schedules where id = $2
			 on conflict (schedule_id, date) do update set teacher_user_id = excluded.teacher_user_id
			 returning id, (xmax = 0)`,
			tenantID, resolved.scheduleID, mapping.LocalDate(sess.AttendanceDate), resolved.classID, resolved.subjectID,
			resolved.teacherID, resolved.startPeriodID, resolved.endPeriodID,
		)
		if err != nil {
			stat.RecordFailure(sess.ID, fmt.Sprintf("upsert session: %v", err))
			continue
		}
		if created {
			stat.Created++
		} else {
			stat.Updated++
		}
		sessionIDs[sess.ID] = id
	}
	return sessionIDs
}

// resolvedSession is what one SionAttendanceSession resolves to once every
// foreign key has been looked up in an earlier step's result map.
type resolvedSession struct {
	scheduleID, classID, subjectID, teacherID, startPeriodID, endPeriodID uuid.UUID
	failureReason                                                         string
}

func (l attendanceLookups) resolveSession(sess SionAttendanceSession) (resolvedSession, bool) {
	schedule, ok := l.schedules[sess.TeachingScheduleID]
	if !ok {
		return resolvedSession{failureReason: "teaching schedule not migrated (see schedules table failures)"}, false
	}
	teacher, ok := l.users[sess.TeacherUserID]
	if !ok {
		return resolvedSession{failureReason: "teacher not migrated (see identity table failures)"}, false
	}
	class, ok := l.classes[sess.ClassID]
	if !ok {
		return resolvedSession{failureReason: "class not migrated (see classes table failures)"}, false
	}
	subjectID, ok := l.subjects[sess.SubjectID]
	if !ok {
		return resolvedSession{failureReason: "subject not migrated (see subjects table failures)"}, false
	}
	startPeriod, ok := l.periods[sess.StartPeriodID]
	if !ok {
		return resolvedSession{failureReason: "start period not migrated (see periods table failures)"}, false
	}
	endPeriod, ok := l.periods[sess.EndPeriodID]
	if !ok {
		return resolvedSession{failureReason: "end period not migrated (see periods table failures)"}, false
	}
	return resolvedSession{
		scheduleID: schedule.targetScheduleID, classID: class.targetClassID, subjectID: subjectID,
		teacherID: teacher.targetUserID, startPeriodID: startPeriod.targetPeriodID, endPeriodID: endPeriod.targetPeriodID,
	}, true
}

func (st *Store) migrateAttendanceEntries(
	ctx context.Context, tenantID uuid.UUID, entries []SionAttendanceEntry,
	sessionIDs map[string]uuid.UUID, users map[string]userMigrationResult, stat *TableStat,
) {
	for _, e := range entries {
		stat.Read++
		sessionID, ok := sessionIDs[e.SessionID]
		if !ok {
			stat.RecordFailure(e.SessionID, "attendance session not migrated (see attendance_sessions table failures)")
			continue
		}
		student, ok := users[e.StudentUserID]
		if !ok {
			stat.RecordFailure(e.SessionID, "student not migrated (see identity table failures)")
			continue
		}
		status, ok := mapping.MapAttendanceStatus(e.Status)
		if !ok {
			stat.RecordFailure(e.SessionID, fmt.Sprintf("unrecognised attendance status %q", e.Status))
			continue
		}

		_, created, err := st.upsertOne(ctx,
			`insert into attendance_entries (tenant_id, session_id, student_user_id, status_code, source, notes)
			 values ($1, $2, $3, $4, 'teacher', $5)
			 on conflict (session_id, student_user_id) do update set status_code = excluded.status_code, notes = excluded.notes
			 returning id, (xmax = 0)`,
			tenantID, sessionID, student.targetUserID, status, e.Notes,
		)
		if err != nil {
			stat.RecordFailure(e.SessionID, fmt.Sprintf("upsert entry: %v", err))
			continue
		}
		if created {
			stat.Created++
		} else {
			stat.Updated++
		}
	}
}
