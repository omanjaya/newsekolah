package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

type authTokensBody struct {
	AccessToken string `json:"access_token"`
	User        struct {
		ID             string `json:"id"`
		ImpersonatedBy *struct {
			UserID string `json:"user_id"`
		} `json:"impersonated_by"`
	} `json:"user"`
}

// cookieJar keeps the latest value of each app-wide (Path=/) cookie a
// response set, the way a browser does, dropping one the response expired.
// Cookies scoped to another path (the legacy refresh cookie being cleared)
// are a different browser cookie and are left out.
type cookieJar map[string]*http.Cookie

func (j cookieJar) take(rec *httptest.ResponseRecorder) {
	for _, c := range rec.Result().Cookies() {
		if c.Path != "" && c.Path != "/" {
			continue
		}
		if c.MaxAge < 0 || c.Value == "" {
			delete(j, c.Name)
			continue
		}
		j[c.Name] = c
	}
}

func (j cookieJar) send(t *testing.T, server http.Handler, method, path, accessToken string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var payload []byte
	if body != nil {
		var err error
		payload, err = json.Marshal(body)
		require.NoError(t, err)
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	if accessToken != "" {
		req.Header.Set("Authorization", "Bearer "+accessToken)
	}
	for _, c := range j {
		req.AddCookie(c)
	}
	rec := httptest.NewRecorder()
	server.ServeHTTP(rec, req)
	j.take(rec)
	return rec
}

// TestImpersonationSurvivesReloadAndStopRestoresAdmin pins the reload that
// signed an impersonating admin out (the impersonation session could not
// refresh, and starting it had replaced the admin's refresh cookie) and the
// "Hentikan" that ended on the sign-in page: through the real router and
// cookies, a page load's refresh keeps the impersonation, and stopping it
// gives the browser the admin's own session back.
func TestImpersonationSurvivesReloadAndStopRestoresAdmin(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	tenantID, adminID := seedTenantWithUser(t, ctx, pg.AdminPool, "impersonation-reload", "admin", "Password123!",
		[]string{authz.PermViewDashboard, authz.PermImpersonateUsers})
	q := db.New(pg.AdminPool)
	target, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: tenantID, Username: "pustakawan", PasswordHash: "x", Name: "Pustakawan", Status: "active", Locale: "id",
	})
	require.NoError(t, err)

	server := newTestServer(t, pg.DSN, pg.AppPool)
	jar := cookieJar{}
	rec := jar.send(t, server, http.MethodPost, "/v1/auth/login", "", map[string]any{
		"username": "admin", "password": "Password123!", "client": "web",
	})
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var login authTokensBody
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &login))

	rec = jar.send(t, server, http.MethodPost, "/v1/users/"+target.ID.String()+"/impersonate", login.AccessToken,
		map[string]any{"client": "web"})
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, jar, httpx.RoleTestingCookieName, "the admin's login is parked in the continuation cookie")

	// The reload: middleware refreshes with whatever cookies the browser holds.
	rec = jar.send(t, server, http.MethodPost, "/v1/auth/refresh", "", nil)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var reloaded authTokensBody
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &reloaded))
	require.Equal(t, target.ID.String(), reloaded.User.ID)
	require.NotNil(t, reloaded.User.ImpersonatedBy, "the banner survives the reload")
	require.Equal(t, adminID.String(), reloaded.User.ImpersonatedBy.UserID)

	// A second reload works too: the impersonation's refresh does not rotate.
	rec = jar.send(t, server, http.MethodPost, "/v1/auth/refresh", "", nil)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	// Hentikan.
	rec = jar.send(t, server, http.MethodPost, "/v1/auth/impersonation/stop", reloaded.AccessToken, nil)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var restored authTokensBody
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &restored))
	require.Equal(t, adminID.String(), restored.User.ID)
	require.Nil(t, restored.User.ImpersonatedBy)
	require.NotContains(t, jar, httpx.RoleTestingCookieName, "the continuation is spent")

	// The browser now holds the admin's own session: a reload stays signed in as the admin.
	rec = jar.send(t, server, http.MethodPost, "/v1/auth/refresh", "", nil)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var after authTokensBody
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &after))
	require.Equal(t, adminID.String(), after.User.ID)

	// The impersonation's own token is dead.
	rec = jar.send(t, server, http.MethodGet, "/v1/me", reloaded.AccessToken, nil)
	require.Equal(t, http.StatusUnauthorized, rec.Code)
}
