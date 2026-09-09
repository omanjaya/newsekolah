package main

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/cmd/etl/mapping"
)

// migrateDutyAssignments migrates SION's teacher_duty_assignments and
// employee_duty_assignments. Keying is on the target's own unique tuple
// (academic_year_id, duty_type_id, user_id, scope_class_id, scope_student_id),
// which matches SION's own `uniq_..._scope` constraints closely enough that
// a re-run does not duplicate a row. A duty name mapping.MapDuty does not
// recognise is a reported gap, not a fabricated duty type.
func (st *Store) migrateDutyAssignments(
	ctx context.Context, tenantID, academicYearID uuid.UUID, startsOn any,
	assignments []SionDutyAssignment, users map[string]userMigrationResult,
	classes map[string]classMigrationResult, dutyIDs map[string]uuid.UUID, stat *TableStat,
) error {
	for _, a := range assignments {
		stat.Read++
		if !a.IsActive {
			stat.Skipped++
			continue
		}
		user, ok := users[a.UserID]
		if !ok {
			stat.RecordFailure(a.UserID, "user not migrated (see identity table failures)")
			continue
		}
		slug, ok := mapping.MapDuty(a.DutyName)
		if !ok {
			stat.RecordGap(fmt.Sprintf("duty %q for user %s has no equivalent duty type", a.DutyName, a.UserID))
			continue
		}
		dutyTypeID, ok := dutyIDs[slug]
		if !ok {
			stat.RecordFailure(a.UserID, fmt.Sprintf("duty type %s was not ensured before this step", slug))
			continue
		}

		var scopeClassID any
		if a.ScopeClassID.Valid {
			if class, ok := classes[a.ScopeClassID.String]; ok {
				scopeClassID = class.targetClassID
				if slug == mapping.DutyHomeroom {
					if err := st.execRow(ctx,
						`update classes set homeroom_teacher_id = $1 where id = $2`,
						user.targetUserID, class.targetClassID,
					); err != nil {
						stat.RecordFailure(a.UserID, fmt.Sprintf("set homeroom teacher: %v", err))
					}
				}
			}
		}

		// duty_assignments' natural-key columns include scope_class_id and
		// scope_student_id, both nullable; Postgres unique constraints treat
		// two NULLs as distinct, so `on conflict` on that tuple would not
		// catch a re-run whose scope is unset. A plain "is not distinct
		// from" lookup does what the constraint cannot.
		existingID, found, err := st.selectID(ctx,
			`select id from duty_assignments
			 where academic_year_id = $1 and duty_type_id = $2 and user_id = $3
			   and scope_class_id is not distinct from $4 and scope_student_id is null`,
			academicYearID, dutyTypeID, user.targetUserID, scopeClassID,
		)
		if err != nil {
			stat.RecordFailure(a.UserID, fmt.Sprintf("lookup duty assignment: %v", err))
			continue
		}
		if found {
			if err := st.execRow(ctx, `update duty_assignments set is_active = true where id = $1`, existingID); err != nil {
				stat.RecordFailure(a.UserID, fmt.Sprintf("update duty assignment: %v", err))
				continue
			}
			stat.Updated++
			continue
		}
		if err := st.execRow(ctx,
			`insert into duty_assignments (tenant_id, academic_year_id, duty_type_id, user_id, scope_class_id, starts_on)
			 values ($1, $2, $3, $4, $5, $6)`,
			tenantID, academicYearID, dutyTypeID, user.targetUserID, scopeClassID, startsOn,
		); err != nil {
			stat.RecordFailure(a.UserID, fmt.Sprintf("create duty assignment: %v", err))
			continue
		}
		stat.Created++
	}
	return nil
}
