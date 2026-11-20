package academic_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// Setting a class's homeroom teacher through the class form keeps one
// active homeroom duty for the class, and refuses a teacher who is
// already homeroom teacher of another class this year (the second class
// was saved silently before, and the teacher could only ever reach one).
func TestClassFormKeepsOneHomeroomPerClassAndTeacher(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	pool := pg.AdminPool
	insertID := func(sql string, args ...any) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, pool.QueryRow(ctx, sql+" returning id", args...).Scan(&id))
		return id
	}

	tenantID := insertID(`insert into tenants (slug,name,education_level,timezone,locale,status,plan) values ('class-form-homeroom','Test','sma','UTC','id','active','default')`)
	year := insertID(`insert into academic_years (tenant_id,label,starts_on,ends_on) values ($1,'2026/2027','2026-01-01','2027-12-31')`, tenantID)
	grade := insertID(`insert into grade_levels (tenant_id,code,name,sequence) values ($1,'X','X',1)`, tenantID)
	insertID(`insert into duty_types (tenant_id,slug,name,scope_kind) values ($1,'homeroom','Wali Kelas','class')`, tenantID)
	guru := insertID(`insert into users (tenant_id,username,password_hash,name,status,locale) values ($1,'guru','x','Guru','active','id')`, tenantID)
	guruBK := insertID(`insert into users (tenant_id,username,password_hash,name,status,locale) values ($1,'gurubk','x','Guru BK','active','id')`, tenantID)

	svc := academic.Register(pg.AppPool, clock.Real{}).Service
	classA, err := svc.CreateClass(ctx, domain.Class{TenantID: tenantID, AcademicYearID: year, GradeLevelID: grade, Name: "X-A"})
	require.NoError(t, err)
	classC, err := svc.CreateClass(ctx, domain.Class{TenantID: tenantID, AcademicYearID: year, GradeLevelID: grade, Name: "X-C"})
	require.NoError(t, err)

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

	classA.HomeroomTeacherID = &guru
	_, err = svc.UpdateClass(ctx, classA)
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{guru}, activeHolders(classA.ID))

	classA.HomeroomTeacherID = &guruBK
	_, err = svc.UpdateClass(ctx, classA)
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{guruBK}, activeHolders(classA.ID), "the previous holder is ended")

	// guruBK already holds X-A: naming them for X-C is refused, and X-C
	// keeps no homeroom teacher.
	classC.HomeroomTeacherID = &guruBK
	_, err = svc.UpdateClass(ctx, classC)
	require.ErrorIs(t, err, domain.ErrTeacherAlreadyHomeroom)
	require.Empty(t, activeHolders(classC.ID))
	reloaded, err := svc.GetClass(ctx, tenantID, classC.ID)
	require.NoError(t, err)
	require.Nil(t, reloaded.HomeroomTeacherID)

	// guru is free again, so X-C can take them.
	classC.HomeroomTeacherID = &guru
	_, err = svc.UpdateClass(ctx, classC)
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{guru}, activeHolders(classC.ID))
}
