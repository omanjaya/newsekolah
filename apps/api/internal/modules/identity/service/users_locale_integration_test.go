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
)

// TestUpdateUser_EmptyLocaleKeepsStoredValue covers the admin user edit
// form, which never sends locale: an empty value must keep the stored
// preference instead of tripping users_locale_check (a 500 on every edit).
func TestUpdateUser_EmptyLocaleKeepsStoredValue(t *testing.T) {
	pg, svc, _ := setupIdentityTest(t)
	ctx := context.Background()
	tenantID := insertTestTenant(t, pg.AdminPool, "locale-"+uuid.NewString()[:8])
	actorID := insertTestUser(t, pg.AdminPool, tenantID, "locale-admin")
	userID := insertTestUser(t, pg.AdminPool, tenantID, "locale-target")
	_, err := pg.AdminPool.Exec(ctx, `update users set locale = 'en' where id = $1`, userID)
	require.NoError(t, err)

	view, err := svc.UpdateUser(ctx, tenantID, actorID, userID, service.UserWriteInput{
		Name: "Renamed User", Email: "locale-target@example.test", ProfileKind: domain.ProfileStaff,
	})
	require.NoError(t, err)
	require.Equal(t, "en", view.Locale)

	var locale string
	require.NoError(t, pg.AdminPool.QueryRow(ctx, `select locale from users where id = $1`, userID).Scan(&locale))
	require.Equal(t, "en", locale)

	// An explicit locale still overwrites the stored one.
	view, err = svc.UpdateUser(ctx, tenantID, actorID, userID, service.UserWriteInput{
		Name: "Renamed User", Email: "locale-target@example.test", ProfileKind: domain.ProfileStaff, Locale: "id",
	})
	require.NoError(t, err)
	require.Equal(t, "id", view.Locale)
}

// TestUpdateMyProfile_EmptyLocaleKeepsStoredValue is the same guard for
// the self-service profile update.
func TestUpdateMyProfile_EmptyLocaleKeepsStoredValue(t *testing.T) {
	pg, _, _ := setupIdentityTest(t)
	svc := service.New(pg.AppPool, repository.New(pg.AppPool), fixedYear{}, nil, nil, clock.Real{}, service.Config{}, auth.NewRefreshToken, service.Extras{})
	ctx := context.Background()
	tenantID := insertTestTenant(t, pg.AdminPool, "locale-me-"+uuid.NewString()[:8])
	userID := insertTestUser(t, pg.AdminPool, tenantID, "locale-self")
	_, err := pg.AdminPool.Exec(ctx, `update users set locale = 'en' where id = $1`, userID)
	require.NoError(t, err)

	_, err = svc.UpdateMyProfile(ctx, tenantID, userID, service.UpdateMyProfileInput{
		Name: "Self Renamed", Email: "locale-self@example.test",
	})
	require.NoError(t, err)

	var locale string
	require.NoError(t, pg.AdminPool.QueryRow(ctx, `select locale from users where id = $1`, userID).Scan(&locale))
	require.Equal(t, "en", locale)
}
