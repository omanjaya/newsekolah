package service_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/auth"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// fixedYear stands in for the school module: it reports one active
// academic year for every tenant.
type fixedYear struct{ id uuid.UUID }

func (f fixedYear) GetActiveAcademicYearID(context.Context, uuid.UUID) (uuid.UUID, bool, error) {
	return f.id, f.id != uuid.Nil, nil
}

func (f fixedYear) ActiveAcademicYearLabel(context.Context, uuid.UUID, uuid.UUID) (string, error) {
	return "2026/2027", nil
}

// TestMeCurrentClass proves GET /v1/me names a student's class from their
// active enrollment in the active year, and leaves it empty for a student
// without one and for a non-student.
func TestMeCurrentClass(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	pool := pg.AdminPool
	insertID := func(sql string, args ...any) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, pool.QueryRow(ctx, sql+" returning id", args...).Scan(&id))
		return id
	}

	tenantID := insertTestTenant(t, pool, "me-class-test")
	year := insertID(`insert into academic_years (tenant_id,label,starts_on,ends_on) values ($1,'2026/2027','2026-01-01','2027-12-31')`, tenantID)
	grade := insertID(`insert into grade_levels (tenant_id,code,name,sequence) values ($1,'X','X',1)`, tenantID)
	class := insertID(`insert into classes (tenant_id,academic_year_id,grade_level_id,name) values ($1,$2,$3,'X-A')`, tenantID, year, grade)

	enrolled := insertTestUser(t, pool, tenantID, "enrolled")
	unenrolled := insertTestUser(t, pool, tenantID, "unenrolled")
	teacher := insertTestUser(t, pool, tenantID, "teacher")
	for id, kind := range map[uuid.UUID]string{enrolled: "student", unenrolled: "student", teacher: "teacher"} {
		_, err := pool.Exec(ctx, `insert into user_profiles (user_id,tenant_id,kind) values ($1,$2,$3)`, id, tenantID, kind)
		require.NoError(t, err)
	}
	_, err := pool.Exec(ctx, `insert into enrollments (tenant_id,academic_year_id,student_user_id,class_id,status,joined_on) values ($1,$2,$3,$4,'active','2026-07-01')`,
		tenantID, year, enrolled, class)
	require.NoError(t, err)
	// A teacher is never given a current class, even with a stray enrollment row.
	_, err = pool.Exec(ctx, `insert into enrollments (tenant_id,academic_year_id,student_user_id,class_id,status,joined_on) values ($1,$2,$3,$4,'active','2026-07-01')`,
		tenantID, year, teacher, class)
	require.NoError(t, err)

	svc := service.New(pg.AppPool, repository.New(pg.AppPool), fixedYear{id: year}, nil, nil, clock.Real{}, service.Config{}, auth.NewRefreshToken, service.Extras{})

	me, err := svc.Me(ctx, tenantID, enrolled, uuid.NullUUID{})
	require.NoError(t, err)
	require.Equal(t, domain.ProfileStudent, me.ProfileKind)
	require.NotNil(t, me.CurrentClass)
	require.Equal(t, class, me.CurrentClass.ID)
	require.Equal(t, "X-A", me.CurrentClass.Name)

	me, err = svc.Me(ctx, tenantID, unenrolled, uuid.NullUUID{})
	require.NoError(t, err)
	require.Nil(t, me.CurrentClass)

	me, err = svc.Me(ctx, tenantID, teacher, uuid.NullUUID{})
	require.NoError(t, err)
	require.Nil(t, me.CurrentClass)

	// No active academic year: nobody has a current class.
	noYear := service.New(pg.AppPool, repository.New(pg.AppPool), fixedYear{}, nil, nil, clock.Real{}, service.Config{}, auth.NewRefreshToken, service.Extras{})
	me, err = noYear.Me(ctx, tenantID, enrolled, uuid.NullUUID{})
	require.NoError(t, err)
	require.Nil(t, me.CurrentClass)
}

// TestCreateDutyTypeDuplicateSlug proves a taken slug surfaces as
// domain.ErrDutyTypeExists (mapped to 409) instead of a raw unique
// violation (500), including a slug held by a soft-deleted duty type.
func TestCreateDutyTypeDuplicateSlug(t *testing.T) {
	pg, svc, _ := setupIdentityTest(t)
	ctx := context.Background()
	tenantID := insertTestTenant(t, pg.AdminPool, "duty-dup-test")

	first, err := svc.CreateDutyType(ctx, tenantID, "picket", "Piket", domain.DutyScopeSchool)
	require.NoError(t, err)

	_, err = svc.CreateDutyType(ctx, tenantID, "picket", "Piket", domain.DutyScopeSchool)
	require.ErrorIs(t, err, domain.ErrDutyTypeExists)

	require.NoError(t, svc.DeleteDutyType(ctx, tenantID, first.ID))
	_, err = svc.CreateDutyType(ctx, tenantID, "picket", "Piket", domain.DutyScopeSchool)
	require.ErrorIs(t, err, domain.ErrDutyTypeExists)
}
