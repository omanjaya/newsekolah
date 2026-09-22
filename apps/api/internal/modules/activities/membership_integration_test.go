package activities_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/activities/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/activities/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/activities/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

func TestArchivedClubReleasesMembershipLimitWithoutDeletingHistory(t *testing.T) {
	ctx := context.Background()
	pg := dbtest.Start(t)
	insertID := func(sql string, args ...any) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, pg.AdminPool.QueryRow(ctx, sql+" returning id", args...).Scan(&id))
		return id
	}
	tenant := insertID(`insert into tenants (slug,name,education_level,timezone,locale,status,plan) values ('activities-test','Test','sma','UTC','id','active','default')`)
	year := insertID(`insert into academic_years (tenant_id,label,starts_on,ends_on) values ($1,'2026/2027','2026-01-01','2027-12-31')`, tenant)
	student := insertID(`insert into users (tenant_id,username,password_hash,name,status,locale) values ($1,'student','x','Student','active','id')`, tenant)
	coach := insertID(`insert into users (tenant_id,username,password_hash,name,status,locale) values ($1,'coach','x','Coach','active','id')`, tenant)
	club := insertID(`insert into extracurriculars (tenant_id,academic_year_id,name) values ($1,$2,'First club')`, tenant, year)
	other := insertID(`insert into extracurriculars (tenant_id,academic_year_id,name) values ($1,$2,'Second club')`, tenant, year)
	repo := repository.New(pg.AppPool)
	svc := service.New(pg.AppPool, repo, nil, nil)
	_, err := svc.UpdateMembershipPolicy(ctx, tenant, coach, 1)
	require.NoError(t, err)
	today := time.Date(2026, 9, 18, 0, 0, 0, 0, time.UTC)
	membership, err := svc.JoinClub(ctx, tenant, club, student, today)
	require.NoError(t, err)
	_, err = svc.JoinClub(ctx, tenant, other, student, today)
	require.ErrorIs(t, err, domain.ErrClubLimitReached)

	// Inactive is reversible and keeps the existing membership/seat reservation.
	_, err = svc.UpdateExtracurricular(ctx, tenant, club, service.ExtracurricularInput{Name: "First club", IsActive: false})
	require.NoError(t, err)
	_, err = svc.JoinClub(ctx, tenant, other, student, today)
	require.ErrorIs(t, err, domain.ErrClubLimitReached)
	_, err = svc.JoinClub(ctx, tenant, club, coach, today)
	require.ErrorIs(t, err, domain.ErrClubInactive)

	require.NoError(t, svc.DeleteExtracurricular(ctx, tenant, club))
	_, err = svc.JoinClub(ctx, tenant, club, coach, today)
	require.ErrorIs(t, err, domain.ErrClubNotFound)
	_, err = svc.JoinClub(ctx, tenant, other, student, today)
	require.NoError(t, err)
	historical, found, err := repo.GetMembership(ctx, tenant, membership.ID)
	require.NoError(t, err)
	require.True(t, found)
	require.Equal(t, membership.ID, historical.ID)
}
