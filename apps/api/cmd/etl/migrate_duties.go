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
	stat.Read += len(classAdmins)
	homeroomHolders, homeroomGaps := pickHomeroomHolders(classAdmins)
	for _, gap := range homeroomGaps {
		stat.RecordGap(gap)
	}
	for _, ca := range homeroomHolders {
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
		homeroomDutyID := dutyIDs[mapping.DutyHomeroom]
		// The target allows one active homeroom holder per class and one
		// homeroom class per teacher (migration 0132). On a re-run after
		// the source changed a class's homeroom teacher, the previous
		// holder must hand over first, or the upsert below is refused.
		if err := st.endOtherHomeroomHolders(ctx, academicYearID, homeroomDutyID, classID, user.targetUserID, startsOn); err != nil {
			stat.RecordFailure(fmt.Sprintf("%d", ca.UserID), fmt.Sprintf("end previous homeroom holder: %v", err))
			continue
		}
		if err := st.upsertDutyAssignment(ctx, tenantID, academicYearID, homeroomDutyID, user.targetUserID, &classID, startsOn, stat, ca.UserID); err != nil {
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
		for _, roleName := range userRoles[userID] {
			slug, ok := mapping.DutyForSpatieRole(roleName)
			if !ok {
				continue // role has no duty equivalent -- not a row this table tracks
			}
			stat.Read++
			// userRoles only ever contains role assignments FetchUserRoles
			// already joined against a real users row (see its doc
			// comment), so this is a defensive check, not the orphan path
			// -- orphaned model_has_roles rows are counted once, in
			// aggregate, by recordDutyGaps instead.
			user, ok := users[userID]
			if !ok {
				continue
			}
			_ = st.upsertDutyAssignment(ctx, tenantID, academicYearID, dutyIDs[slug], user.targetUserID, nil, startsOn, stat, userID)
		}
	}

	managementUserIDs := make([]int64, 0, len(managementStaff))
	for userID := range managementStaff {
		managementUserIDs = append(managementUserIDs, userID)
	}
	sort.Slice(managementUserIDs, func(i, j int) bool { return managementUserIDs[i] < managementUserIDs[j] })

	for _, userID := range managementUserIDs {
		stat.Read++
		user, ok := users[userID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", userID), "user id has no corresponding row in the source users table (orphaned management_staff row)")
			continue
		}
		_ = st.upsertDutyAssignment(ctx, tenantID, academicYearID, dutyIDs[mapping.DutyLeadership], user.targetUserID, nil, startsOn, stat, userID)
	}

	return nil
}

// pickHomeroomHolders keeps one source homeroom teacher per class and one
// class per teacher, the most the target schema allows, in a stable order
// so every run picks the same rows. A class with several administrators,
// or a teacher administering several classes, keeps the lowest source ID
// and the rest is reported as a gap: the target has nowhere to put it.
func pickHomeroomHolders(classAdmins []SionClassAdministrator) ([]SionClassAdministrator, []string) {
	sorted := append([]SionClassAdministrator(nil), classAdmins...)
	sort.Slice(sorted, func(i, j int) bool {
		if sorted[i].ClassID != sorted[j].ClassID {
			return sorted[i].ClassID < sorted[j].ClassID
		}
		return sorted[i].UserID < sorted[j].UserID
	})
	var (
		picked    []SionClassAdministrator
		gaps      []string
		classHeld = map[int64]int64{}
		userHeld  = map[int64]int64{}
	)
	for _, ca := range sorted {
		if holder, ok := classHeld[ca.ClassID]; ok {
			if holder != ca.UserID {
				gaps = append(gaps, fmt.Sprintf("class_administrators: class %d has several administrators; user %d kept as homeroom teacher, user %d not migrated", ca.ClassID, holder, ca.UserID))
			}
			continue
		}
		if class, ok := userHeld[ca.UserID]; ok {
			gaps = append(gaps, fmt.Sprintf("class_administrators: user %d administers several classes; kept as homeroom teacher of class %d, not of class %d", ca.UserID, class, ca.ClassID))
			continue
		}
		classHeld[ca.ClassID], userHeld[ca.UserID] = ca.UserID, ca.ClassID
		picked = append(picked, ca)
	}
	return picked, gaps
}

// endOtherHomeroomHolders ends every active homeroom assignment that would
// conflict with userID holding classID: another teacher's on classID, and
// userID's own on any other class (whose classes.homeroom_teacher_id is
// cleared when it still names userID). Both run in one savepoint.
func (st *Store) endOtherHomeroomHolders(ctx context.Context, academicYearID, dutyTypeID, classID, userID uuid.UUID, endsOn pgtype.Date) error {
	return st.withRowSavepoint(ctx, func() error {
		if _, err := st.tx.Exec(ctx,
			`update duty_assignments set is_active = false, ends_on = coalesce(ends_on, $5)
			 where academic_year_id = $1 and duty_type_id = $2 and scope_class_id = $3
			   and is_active and user_id <> $4`,
			academicYearID, dutyTypeID, classID, userID, endsOn,
		); err != nil {
			return err
		}
		_, err := st.tx.Exec(ctx,
			`with ended as (
			   update duty_assignments set is_active = false, ends_on = coalesce(ends_on, $5)
			   where academic_year_id = $1 and duty_type_id = $2 and user_id = $4
			     and is_active and scope_class_id is not null and scope_class_id <> $3
			   returning scope_class_id
			 )
			 update classes set homeroom_teacher_id = null
			 from ended
			 where classes.id = ended.scope_class_id and classes.homeroom_teacher_id = $4`,
			academicYearID, dutyTypeID, classID, userID, endsOn,
		)
		return err
	})
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
		if err := st.execRow(ctx, `update duty_assignments set is_active = true, ends_on = null where id = $1`, existingID); err != nil {
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
// Both counts are read from MySQL up front by fetchAll, alongside every
// other source table, rather than here -- run.go's migration steps run
// inside the target transaction, and querying the source mid-transaction
// would leave the Postgres connection idle waiting on MySQL, exactly what
// reading the source fully into memory before opening the transaction (see
// docs/13-etl-sion.md) avoids.
func recordDutyGaps(classOfBKCount, bkOnDutyCount, orphanedRoleAssignments int, stat *TableStat) {
	if classOfBKCount > 0 {
		stat.RecordGap(fmt.Sprintf("class_of_bks: %d class-level BK assignment(s) have no equivalent -- counselor duty is school-scoped in the target schema", classOfBKCount))
	}
	if bkOnDutyCount > 0 {
		stat.RecordGap(fmt.Sprintf("bk_on_dutis: %d BK duty-day record(s) have no equivalent column in duty_assignments", bkOnDutyCount))
	}
	if orphanedRoleAssignments > 0 {
		stat.RecordGap(fmt.Sprintf("model_has_roles: %d row(s) assign a role to a user id that no longer exists in the source (orphaned role assignment); none migrated", orphanedRoleAssignments))
	}
}
