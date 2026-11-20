package academic_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"github.com/xuri/excelize/v2"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// TestImportCommitJoinsOnTenantLocalDay is the timezone sweep's regression
// test for the enrollment import: committed at 23:30 UTC on 19 November,
// an Asia/Makassar school's students join on 20 November (07:30 local),
// not on the UTC date of the instant.
func TestImportCommitJoinsOnTenantLocalDay(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	pool := pg.AdminPool
	insertID := func(sql string, args ...any) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, pool.QueryRow(ctx, sql+" returning id", args...).Scan(&id))
		return id
	}

	tenantID := insertID(`insert into tenants (slug,name,education_level,timezone,locale,status,plan) values ($1,'Test','sma','Asia/Makassar','id','active','default')`,
		"import-tz-"+uuid.NewString()[:8])
	year := insertID(`insert into academic_years (tenant_id,label,starts_on,ends_on) values ($1,'2026/2027','2026-07-01','2027-06-30')`, tenantID)
	grade := insertID(`insert into grade_levels (tenant_id,code,name,sequence) values ($1,'X','X',1)`, tenantID)
	insertID(`insert into classes (tenant_id,academic_year_id,grade_level_id,name) values ($1,$2,$3,'X-A')`, tenantID, year, grade)
	student := insertID(`insert into users (tenant_id,username,password_hash,name,status,locale) values ($1,'siswa-import','x','Siswa','active','id')`, tenantID)
	_, err := pool.Exec(ctx, `insert into user_profiles (user_id,tenant_id,kind) values ($1,$2,'student')`, student, tenantID)
	require.NoError(t, err)

	f := excelize.NewFile()
	sheet := f.GetSheetName(0)
	require.NoError(t, f.SetSheetRow(sheet, "A1", &[]any{"NIS", "Username", "Kelas Tujuan"}))
	require.NoError(t, f.SetSheetRow(sheet, "A2", &[]any{"", "siswa-import", "X-A"}))
	buf, err := f.WriteToBuffer()
	require.NoError(t, err)

	svc := academic.Register(pg.AppPool, clock.Frozen{At: time.Date(2026, 11, 19, 23, 30, 0, 0, time.UTC)}).Service
	_, err = svc.ImportCommit(ctx, tenantID, year, buf.Bytes(), false, false)
	require.NoError(t, err)

	var joinedOn time.Time
	require.NoError(t, pool.QueryRow(ctx, `select joined_on from enrollments where student_user_id = $1`, student).Scan(&joinedOn))
	require.Equal(t, "2026-11-20", joinedOn.Format(time.DateOnly))
}

// TestCreateAcademicYearReadsCalendarPolicyOnTenantLocalDay: a calendar
// policy switching to three terms takes effect on 20 November. At 23:30
// UTC on 19 November it is already 20 November (07:30) in Asia/Makassar,
// so a year created then gets three terms, not the previous policy's two.
func TestCreateAcademicYearReadsCalendarPolicyOnTenantLocalDay(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	pool := pg.AdminPool

	var tenantID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`insert into tenants (slug,name,education_level,timezone,locale,status,plan) values ($1,'Test','sma','Asia/Makassar','id','active','default') returning id`,
		"policy-tz-"+uuid.NewString()[:8]).Scan(&tenantID))
	_, err := pool.Exec(ctx,
		`insert into tenant_policies (tenant_id,kind,version,config,effective_from) values
		 ($1,'calendar',1,'{"terms":2}','2026-01-01'),
		 ($1,'calendar',2,'{"terms":3}','2026-11-20')`, tenantID)
	require.NoError(t, err)

	svc := academic.Register(pg.AppPool, clock.Frozen{At: time.Date(2026, 11, 19, 23, 30, 0, 0, time.UTC)}).Service
	year, err := svc.CreateAcademicYear(ctx, tenantID, "2027/2028",
		time.Date(2027, 7, 1, 0, 0, 0, 0, time.UTC), time.Date(2028, 6, 30, 0, 0, 0, 0, time.UTC))
	require.NoError(t, err)
	terms, err := svc.ListTerms(ctx, tenantID, year.ID)
	require.NoError(t, err)
	require.Len(t, terms, 3)
}
