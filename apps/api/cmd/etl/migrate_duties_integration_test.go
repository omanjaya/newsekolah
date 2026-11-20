package main

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/cmd/etl/mapping"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// A re-run after the source changed a class's homeroom teacher converges
// on the new holder instead of failing on the one-holder-per-class guard:
// the previous holder is ended, the class names the new one, and a class
// with two source administrators is reported as a gap, not a failure.
func TestMigrateDutyAssignments_RerunWithChangedHomeroomTeacher(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	pool := pg.AdminPool
	insertID := func(sql string, args ...any) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, pool.QueryRow(ctx, sql+" returning id", args...).Scan(&id))
		return id
	}

	tenantID := insertID(`insert into tenants (slug,name,education_level,timezone,locale,status,plan)
		values ('etl-homeroom','Test School','sma','UTC','id','active','default')`)
	yearID := insertID(`insert into academic_years (tenant_id,label,starts_on,ends_on) values ($1,'2026/2027','2026-07-13','2027-06-30')`, tenantID)
	gradeID := insertID(`insert into grade_levels (tenant_id,code,name,sequence) values ($1,'X','X',1)`, tenantID)
	classA := insertID(`insert into classes (tenant_id,academic_year_id,grade_level_id,name) values ($1,$2,$3,'X-A')`, tenantID, yearID, gradeID)
	classB := insertID(`insert into classes (tenant_id,academic_year_id,grade_level_id,name) values ($1,$2,$3,'X-B')`, tenantID, yearID, gradeID)
	homeroomID := insertID(`insert into duty_types (tenant_id,slug,name,scope_kind) values ($1,'homeroom','Wali Kelas','class')`, tenantID)
	users := map[int64]userMigrationResult{}
	for i, name := range []string{"guru-a", "guru-b", "guru-c"} {
		users[int64(i+1)] = userMigrationResult{targetUserID: insertID(
			`insert into users (tenant_id,username,email,password_hash,name,status,locale)
			 values ($1,$2,$2||'@example.test','x','Test User','active','id')`, tenantID, name)}
	}
	classes := map[int64]classMigrationResult{10: {targetClassID: classA}, 20: {targetClassID: classB}}
	dutyIDs := map[string]uuid.UUID{mapping.DutyHomeroom: homeroomID}
	startsOn := pgtype.Date{Time: time.Date(2026, 7, 13, 0, 0, 0, 0, time.UTC), Valid: true}

	run := func(admins []SionClassAdministrator) *TableStat {
		t.Helper()
		stat := &TableStat{}
		require.NoError(t, runInTransaction(ctx, pool, tenantID, false, func(st *Store) error {
			return st.migrateDutyAssignments(ctx, tenantID, yearID, startsOn, admins, nil, nil, users, classes, dutyIDs, stat)
		}))
		return stat
	}
	activeHolders := func(classID uuid.UUID) []uuid.UUID {
		t.Helper()
		rows, err := pool.Query(ctx, `select user_id from duty_assignments where scope_class_id = $1 and is_active`, classID)
		require.NoError(t, err)
		defer rows.Close()
		var out []uuid.UUID
		for rows.Next() {
			var id uuid.UUID
			require.NoError(t, rows.Scan(&id))
			out = append(out, id)
		}
		return out
	}
	classHomeroom := func(classID uuid.UUID) uuid.NullUUID {
		t.Helper()
		var id uuid.NullUUID
		require.NoError(t, pool.QueryRow(ctx, `select homeroom_teacher_id from classes where id = $1`, classID).Scan(&id))
		return id
	}
	held := func(sourceUserID int64) uuid.NullUUID {
		return uuid.NullUUID{UUID: users[sourceUserID].targetUserID, Valid: true}
	}

	stat := run([]SionClassAdministrator{{ClassID: 10, UserID: 1}, {ClassID: 20, UserID: 2}})
	require.Empty(t, stat.Failures)
	require.Equal(t, []uuid.UUID{users[1].targetUserID}, activeHolders(classA))
	require.Equal(t, held(1), classHomeroom(classA))

	// The source now has guru-c on X-A, and guru-a moved to X-B.
	stat = run([]SionClassAdministrator{{ClassID: 10, UserID: 3}, {ClassID: 20, UserID: 1}})
	require.Empty(t, stat.Failures)
	require.Equal(t, []uuid.UUID{users[3].targetUserID}, activeHolders(classA))
	require.Equal(t, held(3), classHomeroom(classA))
	require.Equal(t, []uuid.UUID{users[1].targetUserID}, activeHolders(classB))
	require.Equal(t, held(1), classHomeroom(classB))

	// Running the same source again changes nothing.
	stat = run([]SionClassAdministrator{{ClassID: 10, UserID: 3}, {ClassID: 20, UserID: 1}})
	require.Empty(t, stat.Failures)
	require.Equal(t, []uuid.UUID{users[3].targetUserID}, activeHolders(classA))
	require.Equal(t, []uuid.UUID{users[1].targetUserID}, activeHolders(classB))

	// Two administrators on one class: one is kept, the other is a gap.
	stat = run([]SionClassAdministrator{{ClassID: 10, UserID: 3}, {ClassID: 10, UserID: 2}, {ClassID: 20, UserID: 1}})
	require.Empty(t, stat.Failures)
	require.Len(t, stat.Gaps, 1)
	require.Equal(t, []uuid.UUID{users[2].targetUserID}, activeHolders(classA), "the lowest source user id is kept")
	require.Equal(t, held(2), classHomeroom(classA))
}

func TestPickHomeroomHolders(t *testing.T) {
	picked, gaps := pickHomeroomHolders([]SionClassAdministrator{
		{ClassID: 20, UserID: 1},
		{ClassID: 10, UserID: 2},
		{ClassID: 10, UserID: 1},
		{ClassID: 10, UserID: 1}, // an exact duplicate is not a gap
		{ClassID: 30, UserID: 3},
	})
	require.Equal(t, []SionClassAdministrator{{ClassID: 10, UserID: 1}, {ClassID: 30, UserID: 3}}, picked)
	require.Len(t, gaps, 2, "class 10's second administrator, and user 1's second class")
}
