package main

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/cmd/etl/mapping"
)

// periodMigrationResult resolves a source period id to the target period id
// and its sequence, which schedules (and, in a later ETL pass, attendance)
// need.
type periodMigrationResult struct {
	targetPeriodID uuid.UUID
	sequence       int16
}

// migratePeriods creates one period_template named after the migrated year
// label (the live schema's periods are global, not year-scoped, but the
// target groups them into a named, reusable template; one template per
// migrated year keeps the same convention the old SION-rewrite mapping used)
// and one period row per source period, keyed on (template, sequence) -- the
// target's own unique constraint.
func (st *Store) migratePeriods(ctx context.Context, tenantID uuid.UUID, yearLabel string, periods []SionPeriod, stat *TableStat) (uuid.UUID, map[int64]periodMigrationResult, error) {
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

	result := make(map[int64]periodMigrationResult, len(periods))
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
			stat.RecordFailure(fmt.Sprintf("%d", p.ID), fmt.Sprintf("upsert period: %v", err))
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

// buildScheduleUnion resolves every schedule_versions revision fetched for
// a migrated year into the single timetable the target schema allows: one
// row per (class, weekday, period) slot. Where two revisions claim the same
// slot, the one with the latest effective_from wins -- never the source's
// own status flag (see docs/13-etl-sion.md "Union jadwal" for why: this
// school's teachers had already been taking attendance against a revision
// still marked 'scheduled' for ten days by the time this was fixed).
// versions must already be ordered oldest-to-last (FetchScheduleVersions'
// own order), which becomes the rank ResolveScheduleUnion compares on.
//
// taIndex resolves each schedule row's class (a schedules row only carries
// a teacher_class_id); a row whose teacher_class this ETL cannot resolve is
// passed through unchanged rather than dropped, so migrateSchedules' own
// per-row validation still reports it as a failure the way it always has --
// buildScheduleUnion only competes rows it can place in a slot.
//
// The second return value maps each slot to the source id of the schedule
// row that won it, which migrateAttendanceSessions needs (after resolving
// that id through this function's own IDMap result) to attach an attendance
// session to the schedule that actually survived for its class/weekday/
// period, and to report when that schedule belongs to a different revision
// than the one the session's own attendances.schedule_id named.
func buildScheduleUnion(
	schedules []SionSchedule, versions []SionScheduleVersion, taIndex map[int64]SionTeachingAssignment,
) (unionRows []SionSchedule, winningScheduleIDBySlot map[mapping.ScheduleSlot]int64) {
	rank := make(map[int64]int, len(versions))
	for i, v := range versions {
		rank[v.ID] = i
	}

	var slotRows []mapping.ScheduleRevisionRow[SionSchedule]
	for _, sch := range schedules {
		weekday, dayOK := mapping.MapDayOfWeek(sch.Day)
		ta, taOK := taIndex[sch.TeacherClassID]
		if !dayOK || !taOK {
			unionRows = append(unionRows, sch)
			continue
		}
		slotRows = append(slotRows, mapping.ScheduleRevisionRow[SionSchedule]{
			Slot:      mapping.ScheduleSlot{ClassID: ta.ClassID, Weekday: weekday, PeriodID: sch.PeriodID},
			VersionID: sch.VersionID,
			Row:       sch,
		})
	}

	winners := mapping.ResolveScheduleUnion(slotRows, rank)
	winningScheduleIDBySlot = make(map[mapping.ScheduleSlot]int64, len(winners))
	for slot, w := range winners {
		unionRows = append(unionRows, w.Row)
		winningScheduleIDBySlot[slot] = w.Row.ID
	}
	return unionRows, winningScheduleIDBySlot
}

// pickPrimaryScheduleVersion picks exactly one schedule_versions row out of
// every version fetched for a year, for the one remaining caller that still
// needs a single revision rather than the union (FetchJournals -- see
// docs/13-etl-sion.md "Union jadwal" for why extending the union to
// journals is left as a follow-up, not attempted here). This replicates the
// rule the whole ETL used everywhere before the union fix: prefer
// status = 'active'; if none is active, the latest effective_from; if still
// tied, the highest id.
func pickPrimaryScheduleVersion(versions []SionScheduleVersion) SionScheduleVersion {
	best := versions[0]
	for _, v := range versions[1:] {
		if isPreferredPrimary(v, best) {
			best = v
		}
	}
	return best
}

func isPreferredPrimary(candidate, current SionScheduleVersion) bool {
	candidateActive, currentActive := candidate.Status == "active", current.Status == "active"
	if candidateActive != currentActive {
		return candidateActive
	}
	if candidate.EffectiveFrom.Valid != current.EffectiveFrom.Valid {
		return candidate.EffectiveFrom.Valid
	}
	if candidate.EffectiveFrom.Valid && !candidate.EffectiveFrom.Time.Equal(current.EffectiveFrom.Time) {
		return candidate.EffectiveFrom.Time.After(current.EffectiveFrom.Time)
	}
	return candidate.ID > current.ID
}

// migrateSchedules keys on (academic_year_id, class_id, day_of_week,
// start_seq), since the target's two exclusion constraints (class+day+period
// range, teacher+day+period range) cannot be an `on conflict` target. Each
// source schedule row names a teacher_class_id, not a teacher/class/subject
// directly, so taIndex (source teacher_classes.id -> assignment, see
// IndexTeachingAssignmentsByID) resolves those first. A live-schema schedule
// row is always exactly one period, so start_period_id = end_period_id.
func (st *Store) migrateSchedules(
	ctx context.Context, tenantID, academicYearID, termID uuid.UUID, schedules []SionSchedule, taIndex map[int64]SionTeachingAssignment,
	users map[int64]userMigrationResult, classes map[int64]classMigrationResult,
	subjects IDMap, periods map[int64]periodMigrationResult, stat *TableStat,
) (IDMap, error) {
	result := make(IDMap, len(schedules))
	for _, sch := range schedules {
		stat.Read++
		ta, ok := taIndex[sch.TeacherClassID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", sch.ID), "teaching assignment not migrated (see teaching_assignments table failures)")
			continue
		}
		teacher, ok := users[ta.TeacherUserID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", sch.ID), "teacher not migrated (see identity table failures)")
			continue
		}
		class, ok := classes[ta.ClassID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", sch.ID), "class not migrated (see classes table failures)")
			continue
		}
		subjectID, ok := subjects[ta.SubjectID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", sch.ID), "subject not migrated (see subjects table failures)")
			continue
		}
		period, ok := periods[sch.PeriodID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", sch.ID), "period not migrated (see periods table failures)")
			continue
		}
		dayOfWeek, ok := mapping.MapDayOfWeek(sch.Day)
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", sch.ID), fmt.Sprintf("unrecognised day %q", sch.Day))
			continue
		}

		existingID, found, err := st.selectID(ctx,
			`select id from schedules where academic_year_id = $1 and class_id = $2 and day_of_week = $3 and start_seq = $4`,
			academicYearID, class.targetClassID, dayOfWeek, period.sequence,
		)
		if err != nil {
			stat.RecordFailure(fmt.Sprintf("%d", sch.ID), fmt.Sprintf("lookup schedule: %v", err))
			continue
		}

		var scheduleID uuid.UUID
		if found {
			if err := st.execRow(ctx,
				`update schedules set term_id = $1, subject_id = $2, teacher_user_id = $3, start_period_id = $4, end_period_id = $4, end_seq = $5, source = 'import'
				 where id = $6`,
				termID, subjectID, teacher.targetUserID, period.targetPeriodID, period.sequence, existingID,
			); err != nil {
				stat.RecordFailure(fmt.Sprintf("%d", sch.ID), fmt.Sprintf("update schedule: %v", err))
				continue
			}
			scheduleID = existingID
			stat.Updated++
		} else {
			id, err := st.insertSchedule(ctx, tenantID, academicYearID, termID, class.targetClassID, subjectID,
				teacher.targetUserID, dayOfWeek, period)
			if err != nil {
				stat.RecordFailure(fmt.Sprintf("%d", sch.ID), fmt.Sprintf("create schedule: %v", err))
				continue
			}
			scheduleID = id
			stat.Created++
		}
		result[sch.ID] = scheduleID
	}
	return result, nil
}

func (st *Store) insertSchedule(
	ctx context.Context, tenantID, academicYearID, termID, classID, subjectID, teacherUserID uuid.UUID,
	dayOfWeek int16, period periodMigrationResult,
) (uuid.UUID, error) {
	var id uuid.UUID
	err := st.withRowSavepoint(ctx, func() error {
		return st.tx.QueryRow(ctx,
			`insert into schedules (
			   tenant_id, academic_year_id, term_id, class_id, subject_id, teacher_user_id,
			   day_of_week, start_period_id, end_period_id, start_seq, end_seq, source
			 ) values ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9, $9, 'import')
			 returning id`,
			tenantID, academicYearID, termID, classID, subjectID, teacherUserID,
			dayOfWeek, period.targetPeriodID, period.sequence,
		).Scan(&id)
	})
	return id, err
}
