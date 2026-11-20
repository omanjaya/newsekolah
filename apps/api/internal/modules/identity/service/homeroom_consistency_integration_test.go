package service_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/auth"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/migrations"
)

// A class has exactly one homeroom teacher, and the class record and the
// duty list always agree on who it is: reactivating an ended row hands the
// class over instead of adding a second holder, ending a row that is not
// the class's current holder leaves the class alone, duplicates left by
// older code heal on the next change, and a teacher cannot become
// homeroom of a second class.
func TestHomeroomDutyStaysConsistentWithTheClass(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	pool := pg.AdminPool
	insertID := func(sql string, args ...any) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, pool.QueryRow(ctx, sql+" returning id", args...).Scan(&id))
		return id
	}

	tenantID := insertTestTenant(t, pool, "homeroom-consistency")
	year := insertID(`insert into academic_years (tenant_id,label,starts_on,ends_on) values ($1,'2026/2027','2026-01-01','2027-12-31')`, tenantID)
	grade := insertID(`insert into grade_levels (tenant_id,code,name,sequence) values ($1,'X','X',1)`, tenantID)
	classA := insertID(`insert into classes (tenant_id,academic_year_id,grade_level_id,name) values ($1,$2,$3,'X-A')`, tenantID, year, grade)
	classC := insertID(`insert into classes (tenant_id,academic_year_id,grade_level_id,name) values ($1,$2,$3,'X-C')`, tenantID, year, grade)
	homeroom := insertID(`insert into duty_types (tenant_id,slug,name,scope_kind) values ($1,'homeroom','Wali Kelas','class')`, tenantID)
	teachers := make([]uuid.UUID, 3)
	for i, name := range []string{"guru", "gurubk", "wakasek"} {
		teachers[i] = insertTestUser(t, pool, tenantID, name)
		_, err := pool.Exec(ctx, `insert into user_profiles (user_id,tenant_id,kind) values ($1,$2,'teacher')`, teachers[i], tenantID)
		require.NoError(t, err)
	}
	guru, guruBK, wakasek := teachers[0], teachers[1], teachers[2]

	svc := service.New(pg.AppPool, repository.New(pg.AppPool), fixedYear{id: year}, nil, nil, clock.Real{}, service.Config{}, auth.NewRefreshToken, service.Extras{})
	assign := func(userID, classID uuid.UUID) (service.DutyAssignmentRecord, error) {
		return svc.CreateDutyAssignment(ctx, tenantID, service.DutyAssignmentRecord{
			AcademicYearID: year, DutyTypeID: homeroom, UserID: userID,
			ScopeClassID: uuid.NullUUID{UUID: classID, Valid: true}, StartsOn: time.Date(2026, 7, 13, 0, 0, 0, 0, time.UTC),
		})
	}
	classHomeroom := func(classID uuid.UUID) uuid.NullUUID {
		t.Helper()
		var id uuid.NullUUID
		require.NoError(t, pool.QueryRow(ctx, `select homeroom_teacher_id from classes where id = $1`, classID).Scan(&id))
		return id
	}
	activeHolders := func(classID uuid.UUID) []uuid.UUID {
		t.Helper()
		rows, err := pool.Query(ctx, `select user_id from duty_assignments where scope_class_id = $1 and is_active order by user_id`, classID)
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
	held := func(id uuid.UUID) uuid.NullUUID { return uuid.NullUUID{UUID: id, Valid: true} }

	guruRow, err := assign(guru, classA)
	require.NoError(t, err)
	_, err = assign(guruBK, classA)
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{guruBK}, activeHolders(classA), "a new holder replaces the old one")
	require.Equal(t, held(guruBK), classHomeroom(classA))

	// Reactivating the ended row hands the class back, instead of leaving
	// two active holders with the class pointing at only one.
	_, err = svc.UpdateDutyAssignment(ctx, tenantID, guruRow.ID, true, nil)
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{guru}, activeHolders(classA))
	require.Equal(t, held(guru), classHomeroom(classA))

	// A teacher is homeroom of one class at a time, through the duty admin.
	_, err = assign(guru, classC)
	require.ErrorIs(t, err, domain.ErrTeacherAlreadyHomeroom)

	// The database refuses a second active holder outright.
	_, err = pool.Exec(ctx, `insert into duty_assignments (tenant_id,academic_year_id,duty_type_id,user_id,scope_class_id,starts_on) values ($1,$2,$3,$4,$5,'2026-07-01')`,
		tenantID, year, homeroom, wakasek, classA)
	require.ErrorContains(t, err, "class already has an active homeroom teacher")
	// ... and a second active homeroom class for one teacher.
	_, err = pool.Exec(ctx, `insert into duty_assignments (tenant_id,academic_year_id,duty_type_id,user_id,scope_class_id,starts_on) values ($1,$2,$3,$4,$5,'2026-07-01')`,
		tenantID, year, homeroom, guru, classC)
	require.ErrorContains(t, err, "teacher is already homeroom teacher of another class")

	// Older data, written before that guard existed, can still hold two
	// active holders: ending the one the class does not point at keeps the
	// class's homeroom teacher.
	setGuard := func(enabled bool) {
		t.Helper()
		verb := "disable"
		if enabled {
			verb = "enable"
		}
		_, err := pool.Exec(ctx, "alter table duty_assignments "+verb+" trigger trg_duty_assignments_single_active_homeroom")
		require.NoError(t, err)
	}
	setGuard(false)
	stray := insertID(`insert into duty_assignments (tenant_id,academic_year_id,duty_type_id,user_id,scope_class_id,starts_on) values ($1,$2,$3,$4,$5,'2026-07-01')`,
		tenantID, year, homeroom, wakasek, classA)
	_, err = svc.UpdateDutyAssignment(ctx, tenantID, stray, false, nil)
	require.NoError(t, err)
	require.Equal(t, held(guru), classHomeroom(classA), "ending a stray holder must not clear the class")

	// Duplicates heal on the next change: every previous holder is ended.
	_ = insertID(`insert into duty_assignments (tenant_id,academic_year_id,duty_type_id,user_id,scope_class_id,starts_on) values ($1,$2,$3,$4,$5,'2026-07-01')`,
		tenantID, year, homeroom, guruBK, classA)
	setGuard(true)
	_, err = assign(wakasek, classA)
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{wakasek}, activeHolders(classA))
	require.Equal(t, held(wakasek), classHomeroom(classA))
}

// Migration 0132 heals a teacher left as homeroom of several classes by
// older code: the newest class is kept, the others are ended and lose
// their homeroom teacher, so the class list and the duty list agree.
func TestSingleHomeroomMigrationHealsATeacherWithTwoClasses(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	pool := pg.AdminPool
	insertID := func(sql string, args ...any) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, pool.QueryRow(ctx, sql+" returning id", args...).Scan(&id))
		return id
	}

	tenantID := insertTestTenant(t, pool, "homeroom-heal-teacher")
	year := insertID(`insert into academic_years (tenant_id,label,starts_on,ends_on) values ($1,'2026/2027','2026-01-01','2027-12-31')`, tenantID)
	grade := insertID(`insert into grade_levels (tenant_id,code,name,sequence) values ($1,'X','X',1)`, tenantID)
	classA := insertID(`insert into classes (tenant_id,academic_year_id,grade_level_id,name) values ($1,$2,$3,'X-A')`, tenantID, year, grade)
	classC := insertID(`insert into classes (tenant_id,academic_year_id,grade_level_id,name) values ($1,$2,$3,'X-C')`, tenantID, year, grade)
	homeroom := insertID(`insert into duty_types (tenant_id,slug,name,scope_kind) values ($1,'homeroom','Wali Kelas','class')`, tenantID)
	guru := insertTestUser(t, pool, tenantID, "guru")

	// The state older code could reach: one teacher active on X-A and X-C.
	_, err := pool.Exec(ctx, "alter table duty_assignments disable trigger trg_duty_assignments_single_active_homeroom")
	require.NoError(t, err)
	older := insertID(`insert into duty_assignments (tenant_id,academic_year_id,duty_type_id,user_id,scope_class_id,starts_on) values ($1,$2,$3,$4,$5,'2026-07-13')`,
		tenantID, year, homeroom, guru, classA)
	newer := insertID(`insert into duty_assignments (tenant_id,academic_year_id,duty_type_id,user_id,scope_class_id,starts_on) values ($1,$2,$3,$4,$5,'2026-11-20')`,
		tenantID, year, homeroom, guru, classC)
	_, err = pool.Exec(ctx, `update classes set homeroom_teacher_id = $1 where id in ($2, $3)`, guru, classA, classC)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, "alter table duty_assignments enable trigger trg_duty_assignments_single_active_homeroom")
	require.NoError(t, err)

	// Run the migration's healing steps again (everything before the guard).
	up, err := migrations.FS.ReadFile("0132_single_active_homeroom.up.sql")
	require.NoError(t, err)
	heal, _, found := strings.Cut(string(up), "create function guard_single_active_homeroom")
	require.True(t, found)
	_, err = pool.Exec(ctx, heal)
	require.NoError(t, err)

	isActive := func(id uuid.UUID) bool {
		t.Helper()
		var active bool
		require.NoError(t, pool.QueryRow(ctx, `select is_active from duty_assignments where id = $1`, id).Scan(&active))
		return active
	}
	classHomeroom := func(classID uuid.UUID) uuid.NullUUID {
		t.Helper()
		var id uuid.NullUUID
		require.NoError(t, pool.QueryRow(ctx, `select homeroom_teacher_id from classes where id = $1`, classID).Scan(&id))
		return id
	}
	require.True(t, isActive(newer), "the teacher keeps the newest class")
	require.False(t, isActive(older))
	require.Equal(t, uuid.NullUUID{UUID: guru, Valid: true}, classHomeroom(classC))
	require.False(t, classHomeroom(classA).Valid, "the class whose holder was ended has no homeroom teacher")
}

// A homeroom duty ended because its class was deleted stays ended:
// reactivating it is refused like assigning a deleted class, so the
// teacher is not made homeroom of a class that no longer exists.
func TestReactivatingADutyOfADeletedClassIsRefused(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	pool := pg.AdminPool
	insertID := func(sql string, args ...any) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, pool.QueryRow(ctx, sql+" returning id", args...).Scan(&id))
		return id
	}

	tenantID := insertTestTenant(t, pool, "homeroom-deleted-class")
	year := insertID(`insert into academic_years (tenant_id,label,starts_on,ends_on) values ($1,'2026/2027','2026-01-01','2027-12-31')`, tenantID)
	grade := insertID(`insert into grade_levels (tenant_id,code,name,sequence) values ($1,'X','X',1)`, tenantID)
	class := insertID(`insert into classes (tenant_id,academic_year_id,grade_level_id,name) values ($1,$2,$3,'X-GONE')`, tenantID, year, grade)
	homeroom := insertID(`insert into duty_types (tenant_id,slug,name,scope_kind) values ($1,'homeroom','Wali Kelas','class')`, tenantID)
	guru := insertTestUser(t, pool, tenantID, "guru")
	_, err := pool.Exec(ctx, `insert into user_profiles (user_id,tenant_id,kind) values ($1,$2,'teacher')`, guru, tenantID)
	require.NoError(t, err)

	svc := service.New(pg.AppPool, repository.New(pg.AppPool), fixedYear{id: year}, nil, nil, clock.Real{}, service.Config{}, auth.NewRefreshToken, service.Extras{})
	row, err := svc.CreateDutyAssignment(ctx, tenantID, service.DutyAssignmentRecord{
		AcademicYearID: year, DutyTypeID: homeroom, UserID: guru,
		ScopeClassID: uuid.NullUUID{UUID: class, Valid: true}, StartsOn: time.Date(2026, 7, 13, 0, 0, 0, 0, time.UTC),
	})
	require.NoError(t, err)

	// What academic.DeleteClass leaves behind: the class soft-deleted and
	// its duty ended.
	_, err = svc.UpdateDutyAssignment(ctx, tenantID, row.ID, false, nil)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `update classes set deleted_at = now(), homeroom_teacher_id = null where id = $1`, class)
	require.NoError(t, err)

	_, err = svc.UpdateDutyAssignment(ctx, tenantID, row.ID, true, nil)
	require.ErrorIs(t, err, domain.ErrScopeTargetNotFound)

	var active bool
	require.NoError(t, pool.QueryRow(ctx, `select is_active from duty_assignments where id = $1`, row.ID).Scan(&active))
	require.False(t, active, "the refused reactivation leaves the duty ended")
	var holder uuid.NullUUID
	require.NoError(t, pool.QueryRow(ctx, `select homeroom_teacher_id from classes where id = $1`, class).Scan(&holder))
	require.False(t, holder.Valid, "the deleted class gets no homeroom teacher back")
}
