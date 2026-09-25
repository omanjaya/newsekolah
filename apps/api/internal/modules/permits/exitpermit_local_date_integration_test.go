package permits

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// localDateWorld is one tenant on a fixed, non-UTC, no-DST timezone
// (Asia/Makassar, UTC+8, WITA) with two enrolled students and a duty
// teacher, enough to exercise the "one exit permit per day" guard across
// the UTC-midnight boundary without a QR token ever being minted (the
// default exit-permit definition opens 'in_progress', which already
// counts for the guard).
type localDateWorld struct {
	tenantID, classID          uuid.UUID
	studentAID, studentBID     uuid.UUID
	dutyTeacherID              uuid.UUID
	startPeriodID, endPeriodID uuid.UUID
}

func seedLocalDateWorld(t *testing.T, ctx context.Context, pool *pgxpool.Pool, slug string) localDateWorld {
	t.Helper()
	q := db.New(pool)
	var w localDateWorld

	tn, err := q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: slug, Name: slug, EducationLevel: "sma", Timezone: "Asia/Makassar", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)
	w.tenantID = tn.ID

	year, err := q.CreateAcademicYear(ctx, db.CreateAcademicYearParams{
		TenantID: w.tenantID, Label: "2025/2026",
		StartsOn: database.Date(time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)),
		EndsOn:   database.Date(time.Date(2030, 1, 1, 0, 0, 0, 0, time.UTC)),
		IsActive: true,
	})
	require.NoError(t, err)
	yearID := year.ID

	var gradeLevelID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`insert into grade_levels (tenant_id, code, name, sequence) values ($1, 'X', 'Kelas X', 1) returning id`,
		w.tenantID,
	).Scan(&gradeLevelID))

	class, err := q.CreateClass(ctx, db.CreateClassParams{TenantID: w.tenantID, AcademicYearID: yearID, GradeLevelID: gradeLevelID, Name: "X-A"})
	require.NoError(t, err)
	w.classID = class.ID

	studentA, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: w.tenantID, Username: "student-a-" + slug, PasswordHash: "x", Name: "Siswa A", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	w.studentAID = studentA.ID

	studentB, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: w.tenantID, Username: "student-b-" + slug, PasswordHash: "x", Name: "Siswa B", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	w.studentBID = studentB.ID

	duty, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: w.tenantID, Username: "piket-" + slug, PasswordHash: "x", Name: "Guru Piket Test", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	w.dutyTeacherID = duty.ID

	for _, studentID := range []uuid.UUID{w.studentAID, w.studentBID} {
		_, err = pool.Exec(ctx,
			`insert into enrollments (tenant_id, academic_year_id, student_user_id, class_id, status, joined_on) values ($1, $2, $3, $4, 'active', current_date)`,
			w.tenantID, yearID, studentID, w.classID,
		)
		require.NoError(t, err)
	}

	template, err := q.AcademicCreatePeriodTemplate(ctx, db.AcademicCreatePeriodTemplateParams{TenantID: w.tenantID, Name: "Default", IsDefault: true})
	require.NoError(t, err)

	startPeriod, err := q.AcademicCreatePeriod(ctx, db.AcademicCreatePeriodParams{
		TenantID: w.tenantID, TemplateID: template.ID, Name: "Jam 1", Sequence: 1,
		StartsAt: pgtype.Time{Microseconds: int64(7 * time.Hour / time.Microsecond), Valid: true},
		EndsAt:   pgtype.Time{Microseconds: int64(8 * time.Hour / time.Microsecond), Valid: true},
	})
	require.NoError(t, err)
	w.startPeriodID = startPeriod.ID

	endPeriod, err := q.AcademicCreatePeriod(ctx, db.AcademicCreatePeriodParams{
		TenantID: w.tenantID, TemplateID: template.ID, Name: "Jam 2", Sequence: 2,
		StartsAt: pgtype.Time{Microseconds: int64(8 * time.Hour / time.Microsecond), Valid: true},
		EndsAt:   pgtype.Time{Microseconds: int64(9 * time.Hour / time.Microsecond), Valid: true},
	})
	require.NoError(t, err)
	w.endPeriodID = endPeriod.ID

	return w
}

// buildExitPermitServiceWithClock mirrors buildLeaveService but takes an
// explicit clock, so a test can freeze the wall clock at a specific UTC
// instant to control which tenant-local calendar day (Asia/Makassar,
// UTC+8, no DST) an exit permit opens on.
func buildExitPermitServiceWithClock(pool *pgxpool.Pool, sync service.AttendanceSync, clk clock.Clock) *service.Service {
	schoolModule := school.Register(pool, tenant.ModeSingle, nil)
	mod := Register(Dependencies{
		Pool: pool, Years: schoolModule.Service, Sync: sync, Clock: clk,
		Config: service.Config{DocumentSigningKey: []byte("a-test-signing-key"), EvidenceMaxBytes: 6 << 20},
	})
	return mod.Service
}

// localDateOf reads workflow_instances.local_date directly, to assert the
// column migration 0120 added actually carries the tenant-local calendar
// day, not whatever opened_date's fixed-UTC approximation would compute.
func localDateOf(t *testing.T, ctx context.Context, pool *pgxpool.Pool, instanceID uuid.UUID) time.Time {
	t.Helper()
	var d time.Time
	require.NoError(t, pool.QueryRow(ctx, `select local_date from workflow_instances where id = $1`, instanceID).Scan(&d))
	return d
}

// TestCreateExitPermit_AllowsBothSidesOfUTCMidnight_SameTenantLocalNight
// is the regression test for the bug this migration fixes: for a tenant
// on Asia/Makassar (UTC+8, 08:00 local = 00:00 UTC), a permit opened at
// 23:00 local and another opened at 07:30 local the *next* tenant-local
// day both fall on the very same UTC calendar date (23:00 local day D is
// 15:00 UTC day D; 07:30 local day D+1 is 23:30 UTC day D). The old
// opened_date-based index and pre-check both keyed on that shared UTC
// date and wrongly refused the second permit as a same-day duplicate,
// even though the school's own calendar had already turned over to a new
// day. Both must now succeed, and local_date must record the correct,
// distinct tenant-local day for each.
func TestCreateExitPermit_AllowsBothSidesOfUTCMidnight_SameTenantLocalNight(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedLocalDateWorld(t, ctx, pg.AdminPool, "midnight-ok-"+uuid.NewString())

	// 23:00 WITA on day D == 15:00 UTC on day D.
	dayD := time.Date(2026, time.June, 10, 15, 0, 0, 0, time.UTC)
	// 07:30 WITA on day D+1 == 23:30 UTC on day D (same UTC calendar
	// date as the instant above -- this is the exact bug).
	dayDPlus1 := time.Date(2026, time.June, 10, 23, 30, 0, 0, time.UTC)
	require.Equal(t, dayD.Truncate(24*time.Hour), dayDPlus1.Truncate(24*time.Hour),
		"the two instants must land on the same UTC calendar date for this test to actually exercise the bug")

	sync := &fakeAttendanceSync{}
	svcNight1 := buildExitPermitServiceWithClock(pg.AppPool, sync, clock.Frozen{At: dayD})
	svcNight2 := buildExitPermitServiceWithClock(pg.AppPool, sync, clock.Frozen{At: dayDPlus1})

	// The first permit is recorded through the duty teacher's desk
	// (RecordExitPermitByStaff), which completes in one step, so the
	// student's second permit the next tenant-local day is refused (if
	// at all) only by the exit-permit-specific "one per day" guard this
	// migration fixes, not by the separate, day-agnostic "already has an
	// in-progress workflow of this kind" guard every kind shares.
	first, err := svcNight1.RecordExitPermitByStaff(ctx, service.RecordExitPermitByStaffInput{
		TenantID: w.tenantID, StudentUserID: w.studentAID, Destination: "Puskesmas",
		StartPeriodID: w.startPeriodID, EndPeriodID: w.endPeriodID, RecordedBy: w.dutyTeacherID,
	})
	require.NoError(t, err)

	second, _, err := svcNight2.CreateExitPermit(ctx, service.CreateExitPermitInput{
		TenantID: w.tenantID, StudentUserID: w.studentAID, Destination: "Jemput adik",
		StartPeriodID: w.startPeriodID, EndPeriodID: w.endPeriodID,
	})
	require.NoError(t, err, "a permit opened the next tenant-local day must not be refused as a same-day duplicate, even though the UTC calendar date has not changed yet")
	require.NotEqual(t, first.Instance.ID, second.ID)

	firstLocalDate := localDateOf(t, ctx, pg.AdminPool, first.Instance.ID)
	secondLocalDate := localDateOf(t, ctx, pg.AdminPool, second.ID)
	require.NotEqual(t, firstLocalDate.Format("2006-01-02"), secondLocalDate.Format("2006-01-02"),
		"local_date must record two distinct tenant-local calendar days")
	require.Equal(t, "2026-06-10", firstLocalDate.Format("2006-01-02"))
	require.Equal(t, "2026-06-11", secondLocalDate.Format("2006-01-02"))
}

// TestCreateExitPermit_RefusesSameTenantLocalDay_EvenAcrossUTCDates is the
// other side of the same bug: two permits opened on the very same
// tenant-local day (Asia/Makassar) but straddling 08:00 local -- which is
// midnight UTC -- land on two *different* UTC calendar dates. The old
// opened_date-based guard would have let the second one through since its
// UTC date differed from the first's; local_date must still refuse it,
// through both the student-facing CreateExitPermit path and the duty
// teacher's RecordExitPermitByStaff path.
func TestCreateExitPermit_RefusesSameTenantLocalDay_EvenAcrossUTCDates(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedLocalDateWorld(t, ctx, pg.AdminPool, "midnight-refuse-"+uuid.NewString())

	// 00:30 WITA on day D == 16:30 UTC on day D-1.
	earlyLocal := time.Date(2026, time.June, 9, 16, 30, 0, 0, time.UTC)
	// 23:30 WITA on the very same day D == 15:30 UTC on day D.
	lateLocal := time.Date(2026, time.June, 10, 15, 30, 0, 0, time.UTC)
	require.NotEqual(t, earlyLocal.Truncate(24*time.Hour), lateLocal.Truncate(24*time.Hour),
		"the two instants must land on different UTC calendar dates for this test to actually exercise the bug")

	sync := &fakeAttendanceSync{}
	svcEarly := buildExitPermitServiceWithClock(pg.AppPool, sync, clock.Frozen{At: earlyLocal})
	svcLate := buildExitPermitServiceWithClock(pg.AppPool, sync, clock.Frozen{At: lateLocal})

	// Both students' first permit is recorded through the duty teacher's
	// desk (RecordExitPermitByStaff), which completes in one step, so the
	// second attempt below is refused (if at all) only by the
	// exit-permit-specific "one per day" guard this migration fixes, not
	// by the separate, day-agnostic "already has an in-progress workflow
	// of this kind" guard every kind shares.

	// Student A: second attempt goes through the normal, student-facing
	// CreateExitPermit path.
	firstA, err := svcEarly.RecordExitPermitByStaff(ctx, service.RecordExitPermitByStaffInput{
		TenantID: w.tenantID, StudentUserID: w.studentAID, Destination: "Puskesmas",
		StartPeriodID: w.startPeriodID, EndPeriodID: w.endPeriodID, RecordedBy: w.dutyTeacherID,
	})
	require.NoError(t, err)
	require.Equal(t, "2026-06-10", localDateOf(t, ctx, pg.AdminPool, firstA.Instance.ID).Format("2006-01-02"))

	_, _, err = svcLate.CreateExitPermit(ctx, service.CreateExitPermitInput{
		TenantID: w.tenantID, StudentUserID: w.studentAID, Destination: "Jemput adik",
		StartPeriodID: w.startPeriodID, EndPeriodID: w.endPeriodID,
	})
	require.ErrorIs(t, err, domain.ErrExitPermitAlreadyToday,
		"same tenant-local day, different UTC date: the normal path must still refuse a second permit")

	// Student B: second attempt goes through the duty teacher's desk
	// (RecordExitPermitByStaff), which applies the exact same guard.
	firstB, err := svcEarly.RecordExitPermitByStaff(ctx, service.RecordExitPermitByStaffInput{
		TenantID: w.tenantID, StudentUserID: w.studentBID, Destination: "Puskesmas",
		StartPeriodID: w.startPeriodID, EndPeriodID: w.endPeriodID, RecordedBy: w.dutyTeacherID,
	})
	require.NoError(t, err)
	require.Equal(t, "2026-06-10", localDateOf(t, ctx, pg.AdminPool, firstB.Instance.ID).Format("2006-01-02"))

	_, err = svcLate.RecordExitPermitByStaff(ctx, service.RecordExitPermitByStaffInput{
		TenantID: w.tenantID, StudentUserID: w.studentBID, Destination: "Jemput adik",
		StartPeriodID: w.startPeriodID, EndPeriodID: w.endPeriodID, RecordedBy: w.dutyTeacherID,
	})
	require.ErrorIs(t, err, domain.ErrExitPermitAlreadyToday,
		"same tenant-local day, different UTC date: the staff-record path must also refuse a second permit")
}
