package academic_test

import (
	"context"
	"io/fs"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/migrator"
	"github.com/omanjaya/newsekolah/apps/api/migrations"
)

// Deleting a class ends the duties scoped to it, its homeroom duty first
// of all, so the duties list keeps no homeroom role with no class and the
// teacher can be named homeroom teacher of another class right away. A
// duty that starts after today (created under a simulated future date)
// ends on its own first day rather than before it starts.
func TestDeleteClassEndsItsDuties(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	pool := pg.AdminPool
	insertID := func(sql string, args ...any) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, pool.QueryRow(ctx, sql+" returning id", args...).Scan(&id))
		return id
	}

	tenantID := insertID(`insert into tenants (slug,name,education_level,timezone,locale,status,plan) values ('class-delete-duties','Test','sma','Asia/Makassar','id','active','default')`)
	year := insertID(`insert into academic_years (tenant_id,label,starts_on,ends_on) values ($1,'2026/2027','2026-07-01','2027-06-30')`, tenantID)
	grade := insertID(`insert into grade_levels (tenant_id,code,name,sequence) values ($1,'X','X',1)`, tenantID)
	insertID(`insert into duty_types (tenant_id,slug,name,scope_kind) values ($1,'homeroom','Wali Kelas','class')`, tenantID)
	guru := insertID(`insert into users (tenant_id,username,password_hash,name,status,locale) values ($1,'guru','x','Guru','active','id')`, tenantID)

	type duty struct {
		active   bool
		startsOn time.Time
		endsOn   *time.Time
	}
	dutiesOf := func(classID uuid.UUID) []duty {
		t.Helper()
		rows, err := pool.Query(ctx, `select is_active, starts_on, ends_on from duty_assignments where scope_class_id = $1 order by created_at`, classID)
		require.NoError(t, err)
		defer rows.Close()
		var out []duty
		for rows.Next() {
			var d duty
			require.NoError(t, rows.Scan(&d.active, &d.startsOn, &d.endsOn))
			out = append(out, d)
		}
		require.NoError(t, rows.Err())
		return out
	}

	// 20 November 2026, 08:00 in Asia/Makassar.
	svc := academic.Register(pg.AppPool, clock.Frozen{At: time.Date(2026, 11, 20, 0, 0, 0, 0, time.UTC)}).Service
	today := time.Date(2026, 11, 20, 0, 0, 0, 0, time.UTC)

	classA, err := svc.CreateClass(ctx, domain.Class{TenantID: tenantID, AcademicYearID: year, GradeLevelID: grade, Name: "X-A", HomeroomTeacherID: &guru})
	require.NoError(t, err)
	require.NoError(t, svc.DeleteClass(ctx, tenantID, classA.ID))

	ended := dutiesOf(classA.ID)
	require.Len(t, ended, 1)
	require.False(t, ended[0].active, "the deleted class's homeroom duty is ended")
	require.NotNil(t, ended[0].endsOn)
	require.Equal(t, today, ended[0].endsOn.UTC())

	// The teacher is free again: a new class can take them as homeroom.
	classB, err := svc.CreateClass(ctx, domain.Class{TenantID: tenantID, AcademicYearID: year, GradeLevelID: grade, Name: "X-B", HomeroomTeacherID: &guru})
	require.NoError(t, err)

	// A duty that starts later than today ends on its own first day.
	future := time.Date(2026, 11, 25, 0, 0, 0, 0, time.UTC)
	classB.HomeroomTeacherID = nil
	_, err = svc.UpdateClass(clock.WithTime(ctx, future.Add(2*time.Hour)), classB)
	require.NoError(t, err)
	classB.HomeroomTeacherID = &guru
	_, err = svc.UpdateClass(clock.WithTime(ctx, future.Add(2*time.Hour)), classB)
	require.NoError(t, err)
	require.NoError(t, svc.DeleteClass(ctx, tenantID, classB.ID))
	for _, d := range dutiesOf(classB.ID) {
		require.False(t, d.active)
		require.NotNil(t, d.endsOn)
		require.False(t, d.endsOn.Before(d.startsOn), "a duty never ends before it starts")
	}
	last := dutiesOf(classB.ID)
	require.Equal(t, future, last[len(last)-1].endsOn.UTC())
}

// Migration "end duties of deleted classes" ends every duty still active on
// a class deleted before DeleteClass started ending them, on the class's
// deletion day in the tenant's calendar, and leaves live classes alone.
func TestMigrationEndsDutiesOfDeletedClasses(t *testing.T) {
	ctx := context.Background()
	pg := dbtest.Start(t)
	pool := pg.AdminPool
	version := migrationVersion(t, "_end_duties_of_deleted_classes.up.sql")
	m, err := migrator.New(pg.DSN)
	require.NoError(t, err)
	t.Cleanup(func() { _, _ = m.Close() })
	require.NoError(t, m.Migrate(version-1))

	insertID := func(sql string, args ...any) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, pool.QueryRow(ctx, sql+" returning id", args...).Scan(&id))
		return id
	}
	tenantID := insertID(`insert into tenants (slug,name,education_level,timezone,locale,status,plan) values ('migrate-deleted-class-duty','Test','sma','Asia/Makassar','id','active','default')`)
	year := insertID(`insert into academic_years (tenant_id,label,starts_on,ends_on) values ($1,'2026/2027','2026-07-01','2027-06-30')`, tenantID)
	grade := insertID(`insert into grade_levels (tenant_id,code,name,sequence) values ($1,'X','X',1)`, tenantID)
	homeroom := insertID(`insert into duty_types (tenant_id,slug,name,scope_kind) values ($1,'homeroom','Wali Kelas','class')`, tenantID)
	guru := insertID(`insert into users (tenant_id,username,password_hash,name,status,locale) values ($1,'guru','x','Guru','active','id')`, tenantID)
	guru2 := insertID(`insert into users (tenant_id,username,password_hash,name,status,locale) values ($1,'guru2','x','Guru 2','active','id')`, tenantID)
	guru3 := insertID(`insert into users (tenant_id,username,password_hash,name,status,locale) values ($1,'guru3','x','Guru 3','active','id')`, tenantID)
	// Deleted at 23:30 UTC on 19 November: 20 November in Asia/Makassar.
	gone := insertID(`insert into classes (tenant_id,academic_year_id,grade_level_id,name,deleted_at) values ($1,$2,$3,'X-GONE','2026-11-19 23:30:00+00')`, tenantID, year, grade)
	gone2 := insertID(`insert into classes (tenant_id,academic_year_id,grade_level_id,name,deleted_at) values ($1,$2,$3,'X-GONE-2','2026-11-19 23:30:00+00')`, tenantID, year, grade)
	live := insertID(`insert into classes (tenant_id,academic_year_id,grade_level_id,name) values ($1,$2,$3,'X-LIVE')`, tenantID, year, grade)
	orphan := insertID(`insert into duty_assignments (tenant_id,academic_year_id,duty_type_id,user_id,scope_class_id,starts_on) values ($1,$2,$3,$4,$5,'2026-11-01')`, tenantID, year, homeroom, guru, gone)
	future := insertID(`insert into duty_assignments (tenant_id,academic_year_id,duty_type_id,user_id,scope_class_id,starts_on) values ($1,$2,$3,$4,$5,'2026-11-25')`, tenantID, year, homeroom, guru2, gone2)
	kept := insertID(`insert into duty_assignments (tenant_id,academic_year_id,duty_type_id,user_id,scope_class_id,starts_on) values ($1,$2,$3,$4,$5,'2026-11-01')`, tenantID, year, homeroom, guru3, live)

	require.NoError(t, m.Migrate(version))

	state := func(id uuid.UUID) (bool, *time.Time) {
		t.Helper()
		var active bool
		var endsOn *time.Time
		require.NoError(t, pool.QueryRow(ctx, `select is_active, ends_on from duty_assignments where id = $1`, id).Scan(&active, &endsOn))
		return active, endsOn
	}
	active, endsOn := state(orphan)
	require.False(t, active)
	require.Equal(t, time.Date(2026, 11, 20, 0, 0, 0, 0, time.UTC), endsOn.UTC())
	active, endsOn = state(future)
	require.False(t, active)
	require.Equal(t, time.Date(2026, 11, 25, 0, 0, 0, 0, time.UTC), endsOn.UTC(), "never before the duty starts")
	active, endsOn = state(kept)
	require.True(t, active, "a live class's duty is untouched")
	require.Nil(t, endsOn)
}

// migrationVersion finds the number of the migration whose up file ends
// with suffix, so the test keeps working if the migration is renumbered.
func migrationVersion(t *testing.T, suffix string) uint {
	t.Helper()
	entries, err := fs.ReadDir(migrations.FS, ".")
	require.NoError(t, err)
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), suffix) {
			n, err := strconv.ParseUint(strings.SplitN(e.Name(), "_", 2)[0], 10, 32)
			require.NoError(t, err)
			return uint(n)
		}
	}
	t.Fatalf("no migration ends with %s", suffix)
	return 0
}
