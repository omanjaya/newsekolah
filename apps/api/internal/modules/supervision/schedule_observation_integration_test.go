package supervision_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/supervision/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/supervision/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// stubScheduleReader resolves every schedule id to the same fixed lesson,
// standing in for the real scheduling module this test does not need.
type stubScheduleReader struct {
	ref service.ScheduleRef
}

func (s stubScheduleReader) GetSchedule(
	_ context.Context, _ uuid.UUID, _ uuid.UUID,
) (service.ScheduleRef, error) {
	return s.ref, nil
}

// TestScheduleObservationPersistsTenantID is a regression test for a bug
// where ScheduleObservation built the domain.ScheduledObservation without
// its TenantID field, so every insert failed the row's tenant_id foreign
// key (it was always the zero UUID, which is never a real tenant) --
// scheduling an observation was completely broken end to end.
func TestScheduleObservationPersistsTenantID(t *testing.T) {
	ctx := context.Background()
	pg := dbtest.Start(t)
	insertID := func(sql string, args ...any) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, pg.AdminPool.QueryRow(ctx, sql+" returning id", args...).Scan(&id))
		return id
	}

	tenant := insertID(`insert into tenants (slug,name,education_level,timezone,locale,status,plan)
		values ('supervision-test','Test','sma','UTC','id','active','default')`)
	year := insertID(`insert into academic_years (tenant_id,label,starts_on,ends_on)
		values ($1,'2026/2027','2026-01-01','2027-12-31')`, tenant)
	teacher := insertID(`insert into users (tenant_id,username,password_hash,name,status,locale)
		values ($1,'teacher','x','Teacher','active','id')`, tenant)
	observer := insertID(`insert into users (tenant_id,username,password_hash,name,status,locale)
		values ($1,'observer','x','Observer','active','id')`, tenant)
	cycle := insertID(`insert into supervision_cycles (tenant_id,academic_year_id,name,instrument)
		values ($1,$2,'Test cycle','{"name":"Instrumen","scale_min":1,"scale_max":4,"criteria":[{"key":"a","name":"A"}]}'::jsonb)`,
		tenant, year)

	repo := repository.New(pg.AppPool)
	schedules := stubScheduleReader{ref: service.ScheduleRef{
		ID: uuid.New(), TeacherUserID: teacher,
	}}
	svc := service.New(pg.AppPool, repo, nil, schedules, nil, nil, nil)

	out, err := svc.ScheduleObservation(ctx, tenant, service.ScheduleObservationInput{
		CycleID: cycle, ScheduleID: schedules.ref.ID,
		LessonDate: time.Date(2026, 9, 28, 0, 0, 0, 0, time.UTC), ObserverUserID: observer,
	})
	require.NoError(t, err)
	require.Equal(t, tenant, out.TenantID)
	require.Equal(t, teacher, out.TeacherUserID)

	// Read back with the admin pool: the repository outside a tenant
	// transaction sees nothing under RLS, by design (see the activities
	// module's membership_integration_test.go for the same pattern). This
	// confirms the row landed under the right tenant rather than merely
	// not erroring.
	stored, found, err := repository.New(pg.AdminPool).GetScheduledObservation(ctx, tenant, out.ID)
	require.NoError(t, err)
	require.True(t, found)
	require.Equal(t, tenant, stored.TenantID)
}
