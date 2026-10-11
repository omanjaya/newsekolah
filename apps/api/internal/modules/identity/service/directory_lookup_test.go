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

// TestLookupDirectoryRejectsOversizedBatch proves the cap is enforced in the
// service, before any database work, so no transport can bypass it.
func TestLookupDirectoryRejectsOversizedBatch(t *testing.T) {
	svc := service.New(nil, nil, nil, nil, nil, clock.Real{}, service.Config{}, auth.NewRefreshToken, service.Extras{})
	ids := make([]uuid.UUID, service.MaxDirectoryIDs+1)
	for i := range ids {
		ids[i] = uuid.New()
	}

	_, err := svc.LookupDirectory(context.Background(), uuid.New(), ids)
	require.ErrorIs(t, err, domain.ErrTooManyDirectoryIDs)
}

func TestLookupDirectoryEmptyIDsReturnsNothing(t *testing.T) {
	svc := service.New(nil, nil, nil, nil, nil, clock.Real{}, service.Config{}, auth.NewRefreshToken, service.Extras{})

	entries, err := svc.LookupDirectory(context.Background(), uuid.New(), nil)
	require.NoError(t, err)
	require.Empty(t, entries)
}

// TestLookupDirectoryByIDs proves the id filter returns exactly the asked-for
// people of the caller's school (any status, students with their NIS) and
// never a person from another school, even when their id is requested.
func TestLookupDirectoryByIDs(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	pool := pg.AdminPool

	tenantID := insertTestTenant(t, pool, "dir-lookup-a")
	otherTenant := insertTestTenant(t, pool, "dir-lookup-b")
	student := insertTestUser(t, pool, tenantID, "dir-student")
	teacher := insertTestUser(t, pool, tenantID, "dir-teacher")
	unrequested := insertTestUser(t, pool, tenantID, "dir-unrequested")
	foreign := insertTestUser(t, pool, otherTenant, "dir-foreign")

	_, err := pool.Exec(ctx, `update users set status = 'inactive' where id = $1`, teacher)
	require.NoError(t, err)
	for id, kind := range map[uuid.UUID]string{student: "student", teacher: "teacher"} {
		_, err := pool.Exec(ctx, `insert into user_profiles (user_id,tenant_id,kind) values ($1,$2,$3)`, id, tenantID, kind)
		require.NoError(t, err)
	}
	_, err = pool.Exec(ctx, `insert into student_profiles (user_id,tenant_id,nis) values ($1,$2,'12345')`, student, tenantID)
	require.NoError(t, err)

	svc := service.New(pg.AppPool, repository.New(pg.AppPool), nil, nil, nil, clock.Real{}, service.Config{}, auth.NewRefreshToken, service.Extras{})

	entries, err := svc.LookupDirectory(ctx, tenantID, []uuid.UUID{student, teacher, foreign, uuid.New()})
	require.NoError(t, err)
	byID := map[uuid.UUID]service.DirectoryEntry{}
	for _, e := range entries {
		byID[e.ID] = e
	}
	require.Len(t, byID, 2)
	require.NotContains(t, byID, unrequested)
	require.NotContains(t, byID, foreign)
	require.Equal(t, domain.ProfileStudent, byID[student].ProfileKind)
	require.Equal(t, "12345", byID[student].NIS)
	require.Equal(t, domain.ProfileTeacher, byID[teacher].ProfileKind)
	require.Empty(t, byID[teacher].NIS)
}
