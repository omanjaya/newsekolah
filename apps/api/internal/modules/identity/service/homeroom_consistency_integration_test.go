package service_test

import (
	"context"
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
