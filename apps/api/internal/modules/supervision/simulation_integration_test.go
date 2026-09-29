package supervision_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/supervision/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/supervision/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/supervision/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// TestSimulatedFutureDutyHonoredWithinSimulatedWindow proves
// SupervisionHasActiveDuty (observationReaderRole's leadership check) reads
// its "today" from the simulated clock: a leadership duty whose starts_on
// is well into the future is not yet active under the real wall-clock
// date, but becomes active once a request carries a simulated date that
// falls inside the duty's [starts_on, ends_on] window -- the fix
// cross_module.sql's SupervisionHasActiveDuty now documents (sqlc.arg
// ('today') instead of bare current_date).
func TestSimulatedFutureDutyHonoredWithinSimulatedWindow(t *testing.T) {
	ctx := context.Background()
	pg := dbtest.Start(t)
	insertID := func(sql string, args ...any) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, pg.AdminPool.QueryRow(ctx, sql+" returning id", args...).Scan(&id))
		return id
	}

	tenantID := insertID(`insert into tenants (slug,name,education_level,timezone,locale,status,plan)
		values ($1,'Test','sma','Asia/Jakarta','id','active','default')`, "supervision-sim-"+uuid.NewString())
	yearID := insertID(`insert into academic_years (tenant_id,label,starts_on,ends_on,is_active)
		values ($1,'2026/2027','2026-01-01','2027-12-31',true)`, tenantID)
	teacherID := insertID(`insert into users (tenant_id,username,password_hash,name,status,locale)
		values ($1,$2,'x','Teacher','active','id')`, tenantID, "teacher-"+uuid.NewString())
	observerID := insertID(`insert into users (tenant_id,username,password_hash,name,status,locale)
		values ($1,$2,'x','Observer','active','id')`, tenantID, "observer-"+uuid.NewString())
	readerID := insertID(`insert into users (tenant_id,username,password_hash,name,status,locale)
		values ($1,$2,'x','Kepsek','active','id')`, tenantID, "kepsek-"+uuid.NewString())
	cycleID := insertID(`insert into supervision_cycles (tenant_id,academic_year_id,name,instrument)
		values ($1,$2,'Test cycle','{"name":"Instrumen","scale_min":1,"scale_max":4,"criteria":[{"key":"a","name":"A"}]}'::jsonb)`,
		tenantID, yearID)
	scheduledID := insertID(`insert into supervision_scheduled_observations (tenant_id,cycle_id,schedule_id,lesson_date,teacher_user_id,observer_user_id)
		values ($1,$2,$3,'2026-09-01',$4,$5)`, tenantID, cycleID, uuid.New(), teacherID, observerID)
	observationID := insertID(`insert into supervision_observations (tenant_id,scheduled_id,cycle_id,teacher_user_id,observer_user_id,scores,observer_notes,observed_at)
		values ($1,$2,$3,$4,$5,$6::jsonb,'Catatan observasi','2026-09-01T08:00:00Z')`,
		tenantID, scheduledID, cycleID, teacherID, observerID, `[{"criterion_key":"a","score":3}]`)

	dutyType, err := db.New(pg.AdminPool).CreateDutyType(ctx, db.CreateDutyTypeParams{
		TenantID: tenantID, Slug: "leadership", Name: "Kepala Sekolah", ScopeKind: "school",
	})
	require.NoError(t, err)
	futureStart := time.Now().AddDate(0, 0, 10)
	_, err = db.New(pg.AdminPool).CreateDutyAssignment(ctx, db.CreateDutyAssignmentParams{
		TenantID: tenantID, AcademicYearID: yearID, DutyTypeID: dutyType.ID, UserID: readerID,
		StartsOn: database.Date(futureStart),
	})
	require.NoError(t, err)

	repo := repository.New(pg.AppPool)
	schoolModule := school.Register(pg.AppPool, tenant.ModeSingle, nil)
	svc := service.New(pg.AppPool, repo, schoolModule.Service, nil, nil, nil, clock.Real{})

	// Without a simulation header, the real wall-clock date is still
	// before starts_on, so the duty is not yet active and readerID (not
	// the observer or the observed teacher) cannot open the observation.
	_, err = svc.GetObservation(ctx, tenantID, observationID, readerID)
	require.ErrorIs(t, err, domain.ErrObservationForbidden,
		"the duty starts in the future, so without simulation it must not be active yet")

	// A simulated date inside the (open-ended) window starting at
	// futureStart must honor the duty.
	simCtx := clock.WithTime(ctx, futureStart.AddDate(0, 0, 2))
	_, err = svc.GetObservation(simCtx, tenantID, observationID, readerID)
	require.NoError(t, err, "a simulated date inside the duty's window must be honored")
}
