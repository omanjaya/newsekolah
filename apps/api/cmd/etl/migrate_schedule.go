package main

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/cmd/etl/mapping"
)

// periodMigrationResult resolves a SION period id to the target period id
// and its sequence, which schedules and attendance_sessions both need.
type periodMigrationResult struct {
	targetPeriodID uuid.UUID
	sequence       int16
}

// migratePeriods creates one period_template named after the SION year
// being migrated (SION scopes periods per academic year directly; the
// target groups them into a named, reusable template) and one period row
// per SION period, keyed on (template, sequence) -- the target's own unique
// constraint.
func (st *Store) migratePeriods(ctx context.Context, tenantID uuid.UUID, yearLabel string, periods []SionPeriod, stat *TableStat) (uuid.UUID, map[string]periodMigrationResult, error) {
	// period_templates has no unique constraint on (tenant_id, name), so
	// idempotency here is a plain select-then-insert rather than an
	// on-conflict upsert.
	templateName := "SION " + yearLabel
	templateID, found, err := st.selectID(ctx, `select id from period_templates where tenant_id = $1 and name = $2`, tenantID, templateName)
	if err != nil {
		return uuid.Nil, nil, fmt.Errorf("lookup period template: %w", err)
	}
	if !found {
		if err := st.withRowSavepoint(ctx, func() error {
			return st.tx.QueryRow(ctx,
				`insert into period_templates (tenant_id, name, is_default) values ($1, $2, false) returning id`,
				tenantID, templateName,
			).Scan(&templateID)
		}); err != nil {
			return uuid.Nil, nil, fmt.Errorf("create period template: %w", err)
		}
	}

	result := make(map[string]periodMigrationResult, len(periods))
	for _, p := range periods {
		stat.Read++
		id, wasCreated, err := st.upsertOne(ctx,
			`insert into periods (tenant_id, template_id, name, sequence, starts_at, ends_at)
			 values ($1, $2, $3, $4, $5, $6)
			 on conflict (template_id, sequence) do update set name = excluded.name, starts_at = excluded.starts_at, ends_at = excluded.ends_at
			 returning id, (xmax = 0)`,
			tenantID, templateID, p.Name, toSequence(p.Sequence), p.StartTime, p.EndTime,
		)
		if err != nil {
			stat.RecordFailure(p.ID, fmt.Sprintf("upsert period: %v", err))
			continue
		}
		if wasCreated {
			stat.Created++
		} else {
			stat.Updated++
		}
		result[p.ID] = periodMigrationResult{targetPeriodID: id, sequence: toSequence(p.Sequence)}
	}
	return templateID, result, nil
}

// scheduleMigrationResult resolves a SION teaching_schedule id to the
// target schedule id, needed by attendance_sessions.
type scheduleMigrationResult struct {
	targetScheduleID uuid.UUID
}

// migrateSchedules keys on the target's own unique tuple implied by its two
// exclusion constraints (class+day+period-range, teacher+day+period-range);
// since an exclusion constraint cannot be an `on conflict` target, this
// looks up by (academic_year_id, class_id, day_of_week, start_seq) instead,
// which is unique in practice because SION never double-books a class's
// period start.
func (st *Store) migrateSchedules(
	ctx context.Context, tenantID, academicYearID uuid.UUID, schedules []SionTeachingSchedule,
	users map[string]userMigrationResult, classes map[string]classMigrationResult,
	subjects map[string]uuid.UUID, periods map[string]periodMigrationResult, stat *TableStat,
) (map[string]scheduleMigrationResult, error) {
	result := make(map[string]scheduleMigrationResult, len(schedules))
	for _, sch := range schedules {
		stat.Read++
		teacher, ok := users[sch.TeacherUserID]
		if !ok {
			stat.RecordFailure(sch.ID, "teacher not migrated (see identity table failures)")
			continue
		}
		class, ok := classes[sch.ClassID]
		if !ok {
			stat.RecordFailure(sch.ID, "class not migrated (see classes table failures)")
			continue
		}
		subjectID, ok := subjects[sch.SubjectID]
		if !ok {
			stat.RecordFailure(sch.ID, "subject not migrated (see subjects table failures)")
			continue
		}
		startPeriod, ok := periods[sch.StartPeriodID]
		if !ok {
			stat.RecordFailure(sch.ID, "start period not migrated (see periods table failures)")
			continue
		}
		endPeriod, ok := periods[sch.EndPeriodID]
		if !ok {
			stat.RecordFailure(sch.ID, "end period not migrated (see periods table failures)")
			continue
		}
		dayOfWeek, ok := mapping.MapDayOfWeek(sch.DayOfWeek)
		if !ok {
			stat.RecordFailure(sch.ID, fmt.Sprintf("unrecognised day_of_week %q", sch.DayOfWeek))
			continue
		}

		existingID, found, err := st.selectID(ctx,
			`select id from schedules where academic_year_id = $1 and class_id = $2 and day_of_week = $3 and start_seq = $4`,
			academicYearID, class.targetClassID, dayOfWeek, startPeriod.sequence,
		)
		if err != nil {
			stat.RecordFailure(sch.ID, fmt.Sprintf("lookup schedule: %v", err))
			continue
		}

		var scheduleID uuid.UUID
		if found {
			if err := st.execRow(ctx,
				`update schedules set subject_id = $1, teacher_user_id = $2, start_period_id = $3, end_period_id = $4, end_seq = $5, source = 'import'
				 where id = $6`,
				subjectID, teacher.targetUserID, startPeriod.targetPeriodID, endPeriod.targetPeriodID, endPeriod.sequence, existingID,
			); err != nil {
				stat.RecordFailure(sch.ID, fmt.Sprintf("update schedule: %v", err))
				continue
			}
			scheduleID = existingID
			stat.Updated++
		} else {
			id, err := st.insertSchedule(ctx, tenantID, academicYearID, class.targetClassID, subjectID,
				teacher.targetUserID, dayOfWeek, startPeriod, endPeriod)
			if err != nil {
				stat.RecordFailure(sch.ID, fmt.Sprintf("create schedule: %v", err))
				continue
			}
			scheduleID = id
			stat.Created++
		}
		result[sch.ID] = scheduleMigrationResult{targetScheduleID: scheduleID}
	}
	return result, nil
}

func (st *Store) insertSchedule(
	ctx context.Context, tenantID, academicYearID, classID, subjectID, teacherUserID uuid.UUID,
	dayOfWeek int16, startPeriod, endPeriod periodMigrationResult,
) (uuid.UUID, error) {
	var id uuid.UUID
	err := st.withRowSavepoint(ctx, func() error {
		return st.tx.QueryRow(ctx,
			`insert into schedules (
			   tenant_id, academic_year_id, class_id, subject_id, teacher_user_id,
			   day_of_week, start_period_id, end_period_id, start_seq, end_seq, source
			 ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'import')
			 returning id`,
			tenantID, academicYearID, classID, subjectID, teacherUserID,
			dayOfWeek, startPeriod.targetPeriodID, endPeriod.targetPeriodID, startPeriod.sequence, endPeriod.sequence,
		).Scan(&id)
	})
	return id, err
}
