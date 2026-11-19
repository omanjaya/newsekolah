package supervision_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/supervision/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/supervision/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/supervision/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// TestOwnReaderReadsOnlyOwnSupervision proves view_own_supervision's
// scope is enforced in the service: a teacher limited to their own records
// (domain.Reader without AllTeachers) reads their own report, export,
// planned visits and observation, and is refused every one of them for
// another teacher -- while a school-wide reader (view_supervision) still
// reads both.
func TestOwnReaderReadsOnlyOwnSupervision(t *testing.T) {
	ctx := context.Background()
	pg := dbtest.Start(t)
	insertID := func(sql string, args ...any) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, pg.AdminPool.QueryRow(ctx, sql+" returning id", args...).Scan(&id))
		return id
	}
	user := func(tenantID uuid.UUID, name string) uuid.UUID {
		return insertID(`insert into users (tenant_id,username,password_hash,name,status,locale)
			values ($1,$2,'x',$3,'active','id')`, tenantID, name+"-"+uuid.NewString(), name)
	}

	tenantID := insertID(`insert into tenants (slug,name,education_level,timezone,locale,status,plan)
		values ($1,'Test','sma','Asia/Jakarta','id','active','default')`, "supervision-own-"+uuid.NewString())
	yearID := insertID(`insert into academic_years (tenant_id,label,starts_on,ends_on,is_active)
		values ($1,'2026/2027','2026-01-01','2027-12-31',true)`, tenantID)
	observed := user(tenantID, "Observed")
	colleague := user(tenantID, "Colleague")
	observer := user(tenantID, "Observer")
	cycleID := insertID(`insert into supervision_cycles (tenant_id,academic_year_id,name,instrument)
		values ($1,$2,'Siklus 1','{"name":"Instrumen","scale_min":1,"scale_max":4,"criteria":[{"key":"a","name":"A"}]}'::jsonb)`,
		tenantID, yearID)
	scheduledID := insertID(`insert into supervision_scheduled_observations (tenant_id,cycle_id,schedule_id,lesson_date,teacher_user_id,observer_user_id)
		values ($1,$2,$3,'2026-09-01',$4,$5)`, tenantID, cycleID, uuid.New(), observed, observer)
	observationID := insertID(`insert into supervision_observations (tenant_id,scheduled_id,cycle_id,teacher_user_id,observer_user_id,scores,observer_notes,observed_at)
		values ($1,$2,$3,$4,$5,$6::jsonb,'Catatan observasi','2026-09-01T08:00:00Z')`,
		tenantID, scheduledID, cycleID, observed, observer, `[{"criterion_key":"a","score":3}]`)

	schoolModule := school.Register(pg.AppPool, tenant.ModeSingle, nil)
	svc := service.New(pg.AppPool, repository.New(pg.AppPool), schoolModule.Service, nil, nil, nil, clock.Real{})
	opts := reportdoc.Options{Format: reportdoc.FormatXLSX}

	own := domain.Reader{UserID: observed}
	report, err := svc.TeacherReport(ctx, tenantID, cycleID, observed, own)
	require.NoError(t, err)
	require.Len(t, report.Observations, 1)
	_, err = svc.ExportTeacherReport(ctx, tenantID, cycleID, observed, own, "id", opts)
	require.NoError(t, err)
	scheduled, err := svc.ListScheduledForTeacher(ctx, tenantID, cycleID, observed, own)
	require.NoError(t, err)
	require.Len(t, scheduled, 1)
	obs, err := svc.GetObservation(ctx, tenantID, observationID, own)
	require.NoError(t, err)
	require.Equal(t, observationID, obs.ID)

	other := domain.Reader{UserID: colleague}
	_, err = svc.TeacherReport(ctx, tenantID, cycleID, observed, other)
	require.ErrorIs(t, err, domain.ErrObservationForbidden, "another teacher's report must be refused")
	_, err = svc.ExportTeacherReport(ctx, tenantID, cycleID, observed, other, "id", opts)
	require.ErrorIs(t, err, domain.ErrObservationForbidden, "another teacher's export must be refused")
	_, err = svc.ListScheduledForTeacher(ctx, tenantID, cycleID, observed, other)
	require.ErrorIs(t, err, domain.ErrObservationForbidden, "another teacher's planned visits must be refused")
	_, err = svc.GetObservation(ctx, tenantID, observationID, other)
	require.ErrorIs(t, err, domain.ErrObservationForbidden, "another teacher's observation must be refused")

	// The colleague still reads their own (empty) report.
	ownEmpty, err := svc.TeacherReport(ctx, tenantID, cycleID, colleague, other)
	require.NoError(t, err)
	require.Empty(t, ownEmpty.Observations)

	// A school-wide reader reads any teacher's report; reading a single
	// observation still follows the observer/leadership/observed rule.
	schoolWide := domain.Reader{UserID: observer, AllTeachers: true}
	_, err = svc.TeacherReport(ctx, tenantID, cycleID, observed, schoolWide)
	require.NoError(t, err)
	_, err = svc.GetObservation(ctx, tenantID, observationID, schoolWide)
	require.NoError(t, err)

	// A teacher id the school does not have is a missing record (a 404 the
	// web shows as its not-found page), not an internal error.
	_, err = svc.TeacherReport(ctx, tenantID, cycleID, uuid.New(), schoolWide)
	require.ErrorIs(t, err, domain.ErrTeacherNotFound)
}
