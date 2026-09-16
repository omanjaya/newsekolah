package main

import (
	"context"
	"fmt"
	"sort"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/omanjaya/newsekolah/apps/api/cmd/etl/mapping"
)

// migrateDutyAssignments derives duty assignments from three independent
// live-schema sources, each mapped to exactly one duty type:
//   - class_administrators -> homeroom (scope_class_id set, and
//     classes.homeroom_teacher_id updated to match)
//   - Spatie role holders (BK, Picket, Pustakawan, Security) -> counselor,
//     picket, librarian, security respectively (school-scoped)
//   - management_staff rows -> leadership (school-scoped)
//
// All three share the same idempotent lookup (upsertDutyAssignment) on the
// target's natural key (academic_year_id, duty_type_id, user_id,
// scope_class_id, scope_student_id).
func (st *Store) migrateDutyAssignments(
	ctx context.Context, tenantID, academicYearID uuid.UUID, startsOn pgtype.Date,
	classAdmins []SionClassAdministrator, userRoles map[int64][]string, managementStaff map[int64]string,
	users map[int64]userMigrationResult, classes map[int64]classMigrationResult, dutyIDs map[string]uuid.UUID,
	stat *TableStat,
) error {
	for _, ca := range classAdmins {
		stat.Read++
		user, ok := users[ca.UserID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", ca.UserID), "user not migrated (see identity table failures)")
			continue
		}
		class, ok := classes[ca.ClassID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", ca.UserID), "class not migrated (see classes table failures)")
			continue
		}
		classID := class.targetClassID
		if err := st.upsertDutyAssignment(ctx, tenantID, academicYearID, dutyIDs[mapping.DutyHomeroom], user.targetUserID, &classID, startsOn, stat, ca.UserID); err != nil {
			continue
		}
		if err := st.execRow(ctx, `update classes set homeroom_teacher_id = $1 where id = $2`, user.targetUserID, classID); err != nil {
			stat.RecordFailure(fmt.Sprintf("%d", ca.UserID), fmt.Sprintf("set homeroom teacher: %v", err))
		}
	}

	// Iterating a Go map in a fixed, sorted order keeps duty_assignments
	// processed in a stable sequence across runs -- otherwise the report's
	// read/created/updated counts would still match, but Failures/Gaps
	// ordering (and savepoint numbering) would vary run to run for no
	// reason.
	roleUserIDs := make([]int64, 0, len(userRoles))
	for userID := range userRoles {
		roleUserIDs = append(roleUserIDs, userID)
	}
	sort.Slice(roleUserIDs, func(i, j int) bool { return roleUserIDs[i] < roleUserIDs[j] })

	for _, userID := range roleUserIDs {
		user, ok := users[userID]
		if !ok {
			continue // identity failures already recorded in the users table
		}
		for _, roleName := range userRoles[userID] {
			slug, ok := mapping.DutyForSpatieRole(roleName)
			if !ok {
				continue
			}
			stat.Read++
			_ = st.upsertDutyAssignment(ctx, tenantID, academicYearID, dutyIDs[slug], user.targetUserID, nil, startsOn, stat, userID)
		}
	}

	managementUserIDs := make([]int64, 0, len(managementStaff))
	for userID := range managementStaff {
		managementUserIDs = append(managementUserIDs, userID)
	}
	sort.Slice(managementUserIDs, func(i, j int) bool { return managementUserIDs[i] < managementUserIDs[j] })

	for _, userID := range managementUserIDs {
		user, ok := users[userID]
		if !ok {
			continue
		}
		stat.Read++
		_ = st.upsertDutyAssignment(ctx, tenantID, academicYearID, dutyIDs[mapping.DutyLeadership], user.targetUserID, nil, startsOn, stat, userID)
	}

	return nil
}

// upsertDutyAssignment is shared by every duty source above.
// duty_assignments' natural key includes two nullable scope columns, and
// Postgres unique constraints treat two NULLs as distinct, so `on conflict`
// on that tuple would not catch a re-run whose scope is unset; a plain "is
// not distinct from" lookup does what the constraint cannot.
func (st *Store) upsertDutyAssignment(
	ctx context.Context, tenantID, academicYearID, dutyTypeID, userID uuid.UUID,
	scopeClassID *uuid.UUID, startsOn pgtype.Date, stat *TableStat, sourceUserID int64,
) error {
	var scopeArg any
	if scopeClassID != nil {
		scopeArg = *scopeClassID
	}

	existingID, found, err := st.selectID(ctx,
		`select id from duty_assignments
		 where academic_year_id = $1 and duty_type_id = $2 and user_id = $3
		   and scope_class_id is not distinct from $4 and scope_student_id is null`,
		academicYearID, dutyTypeID, userID, scopeArg,
	)
	if err != nil {
		stat.RecordFailure(fmt.Sprintf("%d", sourceUserID), fmt.Sprintf("lookup duty assignment: %v", err))
		return err
	}
	if found {
		if err := st.execRow(ctx, `update duty_assignments set is_active = true where id = $1`, existingID); err != nil {
			stat.RecordFailure(fmt.Sprintf("%d", sourceUserID), fmt.Sprintf("update duty assignment: %v", err))
			return err
		}
		stat.Updated++
		return nil
	}

	if err := st.execRow(ctx,
		`insert into duty_assignments (tenant_id, academic_year_id, duty_type_id, user_id, scope_class_id, starts_on)
		 values ($1, $2, $3, $4, $5, $6)`,
		tenantID, academicYearID, dutyTypeID, userID, scopeArg, startsOn,
	); err != nil {
		stat.RecordFailure(fmt.Sprintf("%d", sourceUserID), fmt.Sprintf("create duty assignment: %v", err))
		return err
	}
	stat.Created++
	return nil
}

// recordDutyGaps notes the two live-schema tables migrateDutyAssignments
// deliberately does not migrate in detail: class_of_bks (per-class BK
// assignment -- the target's counselor duty type is school-scoped, so a
// per-class detail has nowhere to attach) and bk_on_dutis (which weekday
// each BK counselor is on duty -- duty_assignments has no such column).
func recordDutyGaps(source *Source, yearID int64, stat *TableStat) {
	if n, err := source.CountClassOfBKAssignments(yearID); err == nil && n > 0 {
		stat.RecordGap(fmt.Sprintf("class_of_bks: %d class-level BK assignment(s) have no equivalent -- counselor duty is school-scoped in the target schema", n))
	}
	if n, err := source.CountBKOnDutyRecords(); err == nil && n > 0 {
		stat.RecordGap(fmt.Sprintf("bk_on_dutis: %d BK duty-day record(s) have no equivalent column in duty_assignments", n))
	}
}
