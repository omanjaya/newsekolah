package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/auth"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// TestDutyWindowsUseTenantLocalDate is the timezone sweep's regression
// test for identity's duty windows. At 23:30 UTC on 19 November an
// Asia/Makassar school is at 07:30 on 20 November: a duty that starts on
// 20 November is active (its permission granted, its holder notified) and
// one that ended on 19 November is not, although the UTC date is still
// 19 November. Reactivating an ended homeroom row ends the class's other
// holder on the school's own date too.
func TestDutyWindowsUseTenantLocalDate(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	pool := pg.AdminPool
	insertID := func(sql string, args ...any) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, pool.QueryRow(ctx, sql+" returning id", args...).Scan(&id))
		return id
	}

	tenantID := insertTestTenant(t, pool, "duty-tz-"+uuid.NewString()[:8])
	_, err := pool.Exec(ctx, `update tenants set timezone = 'Asia/Makassar' where id = $1`, tenantID)
	require.NoError(t, err)
	year := insertID(`insert into academic_years (tenant_id,label,starts_on,ends_on,is_active) values ($1,'2026/2027','2026-07-01','2027-06-30',true)`, tenantID)

	starting := insertTestUser(t, pool, tenantID, "starts-today")
	ended := insertTestUser(t, pool, tenantID, "ended-yesterday")
	picket := insertID(`insert into duty_types (tenant_id,slug,name,scope_kind) values ($1,'picket','Piket','school')`, tenantID)
	_, err = pool.Exec(ctx, `insert into duty_permissions (duty_type_id,permission_code,tenant_id) values ($1,$2,$3)`,
		picket, authz.PermCorrectAttendance, tenantID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `insert into duty_assignments (tenant_id,academic_year_id,duty_type_id,user_id,starts_on) values ($1,$2,$3,$4,'2026-11-20')`,
		tenantID, year, picket, starting)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `insert into duty_assignments (tenant_id,academic_year_id,duty_type_id,user_id,starts_on,ends_on) values ($1,$2,$3,$4,'2026-08-01','2026-11-19')`,
		tenantID, year, picket, ended)
	require.NoError(t, err)

	at := time.Date(2026, 11, 19, 23, 30, 0, 0, time.UTC)
	svc := service.New(pg.AppPool, repository.New(pg.AppPool), fixedYear{id: year}, nil, nil, clock.Frozen{At: at}, service.Config{}, auth.NewRefreshToken, service.Extras{})

	// Authenticated requests carry the tenant; the zone comes from it.
	reqCtx := tenant.WithTenant(ctx, tenant.Tenant{ID: tenantID, Timezone: "Asia/Makassar"})
	perms, err := svc.EffectivePermissions(reqCtx, tenantID, starting)
	require.NoError(t, err)
	require.True(t, perms.Has(authz.PermCorrectAttendance), "a duty starting on the school's today is active")
	perms, err = svc.EffectivePermissions(reqCtx, tenantID, ended)
	require.NoError(t, err)
	require.False(t, perms.Has(authz.PermCorrectAttendance), "a duty that ended on the school's yesterday is not")

	// Without a tenant on the context (event delivery) the zone is read
	// from the tenants row.
	perms, err = svc.EffectivePermissions(ctx, tenantID, starting)
	require.NoError(t, err)
	require.True(t, perms.Has(authz.PermCorrectAttendance))

	holders, err := svc.UsersWithDuty(ctx, tenantID, "picket", uuid.NullUUID{})
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{starting}, holders, "notifications reach the holder of the school's today only")

	// Homeroom takeover: reactivating an ended row ends the current
	// holder on 20 November, the school's date.
	grade := insertID(`insert into grade_levels (tenant_id,code,name,sequence) values ($1,'X','X',1)`, tenantID)
	class := insertID(`insert into classes (tenant_id,academic_year_id,grade_level_id,name) values ($1,$2,$3,'X-A')`, tenantID, year, grade)
	homeroom := insertID(`insert into duty_types (tenant_id,slug,name,scope_kind) values ($1,'homeroom','Wali Kelas','class')`, tenantID)
	first, second := insertTestUser(t, pool, tenantID, "wali-a"), insertTestUser(t, pool, tenantID, "wali-b")
	firstRow := insertID(`insert into duty_assignments (tenant_id,academic_year_id,duty_type_id,user_id,scope_class_id,starts_on,ends_on,is_active) values ($1,$2,$3,$4,$5,'2026-07-13','2026-09-30',false)`,
		tenantID, year, homeroom, first, class)
	secondRow := insertID(`insert into duty_assignments (tenant_id,academic_year_id,duty_type_id,user_id,scope_class_id,starts_on) values ($1,$2,$3,$4,$5,'2026-10-01')`,
		tenantID, year, homeroom, second, class)

	_, err = svc.UpdateDutyAssignment(reqCtx, tenantID, firstRow, true, nil)
	require.NoError(t, err)
	var endsOn time.Time
	require.NoError(t, pool.QueryRow(ctx, `select ends_on from duty_assignments where id = $1`, secondRow).Scan(&endsOn))
	require.Equal(t, "2026-11-20", endsOn.Format(time.DateOnly))
}
