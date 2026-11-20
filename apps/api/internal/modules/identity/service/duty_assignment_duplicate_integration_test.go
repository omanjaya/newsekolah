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

// A double submitted "Beri tugas" for a school-wide duty (Guru Piket) used
// to save the same assignment twice: the table's unique constraint never
// matched rows whose scope columns are null. A second active assignment of
// the same duty, person and scope is refused, by the service check and, for
// two concurrent requests, by the partial unique index; ending the first
// frees the person to be assigned again, and reactivating an ended row is
// refused while an identical one is active.
func TestDutyAssignmentRefusesActiveDuplicate(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	pool := pg.AdminPool
	insertID := func(sql string, args ...any) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, pool.QueryRow(ctx, sql+" returning id", args...).Scan(&id))
		return id
	}

	tenantID := insertTestTenant(t, pool, "duty-duplicate")
	year := insertID(`insert into academic_years (tenant_id,label,starts_on,ends_on) values ($1,'2026/2027','2026-01-01','2027-12-31')`, tenantID)
	picket := insertID(`insert into duty_types (tenant_id,slug,name,scope_kind) values ($1,'picket','Guru Piket','school')`, tenantID)
	teacher := insertTestUser(t, pool, tenantID, "ratna")
	_, err := pool.Exec(ctx, `insert into user_profiles (user_id,tenant_id,kind) values ($1,$2,'teacher')`, teacher, tenantID)
	require.NoError(t, err)

	svc := service.New(pg.AppPool, repository.New(pg.AppPool), fixedYear{id: year}, nil, nil, clock.Real{}, service.Config{}, auth.NewRefreshToken, service.Extras{})
	in := service.DutyAssignmentRecord{
		AcademicYearID: year, DutyTypeID: picket, UserID: teacher,
		StartsOn: time.Date(2027, 2, 1, 0, 0, 0, 0, time.UTC),
	}

	first, err := svc.CreateDutyAssignment(ctx, tenantID, in)
	require.NoError(t, err)
	_, err = svc.CreateDutyAssignment(ctx, tenantID, in)
	require.ErrorIs(t, err, domain.ErrDutyAssignmentExists)

	// The index alone refuses the duplicate a concurrent request would
	// insert after both passed the service check.
	_, err = repository.New(pg.AdminPool).CreateDutyAssignmentRecord(ctx, tenantID, in)
	require.ErrorIs(t, err, domain.ErrDutyAssignmentExists)

	var active int
	require.NoError(t, pool.QueryRow(ctx, `select count(*) from duty_assignments where tenant_id = $1 and is_active`, tenantID).Scan(&active))
	require.Equal(t, 1, active)

	// Ending it frees the person for a new assignment of the same duty...
	endsOn := in.StartsOn
	_, err = svc.UpdateDutyAssignment(ctx, tenantID, first.ID, false, &endsOn)
	require.NoError(t, err)
	second, err := svc.CreateDutyAssignment(ctx, tenantID, in)
	require.NoError(t, err)

	// ...and while that one is active, the ended row cannot come back.
	_, err = svc.UpdateDutyAssignment(ctx, tenantID, first.ID, true, nil)
	require.ErrorIs(t, err, domain.ErrDutyAssignmentExists)
	require.NotEqual(t, first.ID, second.ID)
}

// Ending an assignment before its start date is a date-range error, not a
// "scope_kind" one, so the client can name the field; the assignment can
// still be ended on its start date or deleted outright before it starts.
func TestEndingDutyAssignmentBeforeItStarts(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	pool := pg.AdminPool
	insertID := func(sql string, args ...any) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, pool.QueryRow(ctx, sql+" returning id", args...).Scan(&id))
		return id
	}

	tenantID := insertTestTenant(t, pool, "duty-future-end")
	year := insertID(`insert into academic_years (tenant_id,label,starts_on,ends_on) values ($1,'2026/2027','2026-01-01','2027-12-31')`, tenantID)
	picket := insertID(`insert into duty_types (tenant_id,slug,name,scope_kind) values ($1,'picket','Guru Piket','school')`, tenantID)
	teacher := insertTestUser(t, pool, tenantID, "ratna")
	_, err := pool.Exec(ctx, `insert into user_profiles (user_id,tenant_id,kind) values ($1,$2,'teacher')`, teacher, tenantID)
	require.NoError(t, err)

	svc := service.New(pg.AppPool, repository.New(pg.AppPool), fixedYear{id: year}, nil, nil, clock.Real{}, service.Config{}, auth.NewRefreshToken, service.Extras{})
	startsOn := time.Date(2027, 2, 1, 0, 0, 0, 0, time.UTC)
	future, err := svc.CreateDutyAssignment(ctx, tenantID, service.DutyAssignmentRecord{
		AcademicYearID: year, DutyTypeID: picket, UserID: teacher, StartsOn: startsOn,
	})
	require.NoError(t, err)

	before := startsOn.AddDate(0, 0, -7)
	_, err = svc.UpdateDutyAssignment(ctx, tenantID, future.ID, false, &before)
	require.ErrorIs(t, err, domain.ErrInvalidDutyDateRange)

	require.NoError(t, svc.DeleteDutyAssignment(ctx, tenantID, future.ID))
	var left int
	require.NoError(t, pool.QueryRow(ctx, `select count(*) from duty_assignments where tenant_id = $1`, tenantID).Scan(&left))
	require.Zero(t, left)
}
