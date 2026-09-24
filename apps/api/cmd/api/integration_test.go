package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/auth"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/config"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// testJWTSigningKey is a fixed, throwaway ES256 key (base64 PKCS8) used
// only in tests -- never a real secret.
const testJWTSigningKey = "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgyZOuzgGHqLcnTNx0rFY+4xp/4PmYcGnmVw+0zvdYy1qhRANCAATZXimBF2/ovrkvqh4FA0A9LOzv8Jh0bWLWh6XQVBFAKCsu9sIZl0akO0PbAIaW3nAiqXMXAWaT/uhX1c2WBQGW"

func testConfig(dsn string) config.Config {
	return config.Config{
		AppEnv:             "test",
		TenancyMode:        config.TenancySingle,
		DatabaseURL:        dsn,
		JWTSigningKey:      testJWTSigningKey,
		DocumentSigningKey: "test-document-signing-key-at-least-32-chars",
		AccessTokenTTL:     15 * time.Minute,
		RefreshTokenTTL:    720 * time.Hour,
		BodyLimitBytes:     1 << 20,
		OpenAPIValidation:  "enforce",
	}
}

func newTestServer(t *testing.T, dsn string, pool *pgxpool.Pool) http.Handler {
	t.Helper()
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	router, _, err := buildRouter(testConfig(dsn), logger, pool, nil, "test")
	require.NoError(t, err)
	return router
}

// seedTenantWithUser creates a tenant, one role with the given permissions,
// and one active user holding it, returning IDs the test needs.
func seedTenantWithUser(t *testing.T, ctx context.Context, pool *pgxpool.Pool, slug, username, password string, permissions []string) (tenantID, userID uuid.UUID) {
	t.Helper()
	q := db.New(pool)

	tenant, err := q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: slug, Name: slug, EducationLevel: "sma", Timezone: "Asia/Makassar", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)

	role, err := q.CreateRole(ctx, db.CreateRoleParams{TenantID: tenant.ID, Slug: "tester", Name: "Tester", IsSystem: false})
	require.NoError(t, err)
	for _, perm := range permissions {
		require.NoError(t, q.AddRolePermission(ctx, db.AddRolePermissionParams{RoleID: role.ID, PermissionCode: perm, TenantID: tenant.ID}))
	}

	hash, err := auth.HashPassword(password)
	require.NoError(t, err)
	user, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: tenant.ID, Username: username, PasswordHash: hash, Name: username,
		Status: "active", MustChangePassword: false, Locale: "id",
	})
	require.NoError(t, err)
	require.NoError(t, q.AssignUserRole(ctx, db.AssignUserRoleParams{UserID: user.ID, RoleID: role.ID, TenantID: tenant.ID, IsPrimary: true}))

	return tenant.ID, user.ID
}

func doJSON(t *testing.T, handler http.Handler, method, path string, body any, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	reader := bytes.NewBuffer(nil)
	if body != nil {
		b, err := json.Marshal(body)
		require.NoError(t, err)
		reader = bytes.NewBuffer(b)
	}
	req := httptest.NewRequest(method, path, reader)
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec
}

func TestLoginRefreshLogoutFlow(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()

	seedTenantWithUser(t, ctx, pg.AdminPool, "flow-tenant", "flowuser", "Password123!", []string{authz.PermViewDashboard})
	server := newTestServer(t, pg.DSN, pg.AppPool)

	// Web login: refresh token via cookie, not body.
	rec := doJSON(t, server, http.MethodPost, "/v1/auth/login", map[string]any{
		"username": "flowuser", "password": "Password123!", "client": "web",
	}, nil)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Header().Get("Set-Cookie"), "refresh_token=")

	var loginBody map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &loginBody))
	require.Empty(t, loginBody["refresh_token"], "web login must not echo the refresh token in the body")
	accessToken := loginBody["access_token"].(string)

	cookie := rec.Result().Cookies()[0]

	// GET /v1/me with the access token.
	rec = doJSON(t, server, http.MethodGet, "/v1/me", nil, map[string]string{"Authorization": "Bearer " + accessToken})
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	// Mobile login: refresh token in the body.
	rec = doJSON(t, server, http.MethodPost, "/v1/auth/login", map[string]any{
		"username": "flowuser", "password": "Password123!", "client": "ios",
	}, nil)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &loginBody))
	mobileRefreshToken := loginBody["refresh_token"].(string)
	require.NotEmpty(t, mobileRefreshToken)

	// Refresh rotation via cookie (web).
	req := httptest.NewRequest(http.MethodPost, "/v1/auth/refresh", nil)
	req.AddCookie(cookie)
	rec = httptest.NewRecorder()
	server.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	newCookie := rec.Result().Cookies()[0]
	require.NotEqual(t, cookie.Value, newCookie.Value, "refresh must rotate the token")

	// Reusing the now-rotated cookie must fail and revoke the family.
	req = httptest.NewRequest(http.MethodPost, "/v1/auth/refresh", nil)
	req.AddCookie(cookie)
	rec = httptest.NewRecorder()
	server.ServeHTTP(rec, req)
	require.Equal(t, http.StatusUnauthorized, rec.Code, "reusing a rotated refresh token must be rejected")

	// The freshly rotated token must also now be dead, because reuse
	// detection revoked the whole family.
	req = httptest.NewRequest(http.MethodPost, "/v1/auth/refresh", nil)
	req.AddCookie(newCookie)
	rec = httptest.NewRecorder()
	server.ServeHTTP(rec, req)
	require.Equal(t, http.StatusUnauthorized, rec.Code, "reuse detection must revoke the entire session family")

	// Mobile refresh via body.
	rec = doJSON(t, server, http.MethodPost, "/v1/auth/refresh", map[string]any{"refresh_token": mobileRefreshToken}, nil)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &loginBody))
	require.NotEmpty(t, loginBody["refresh_token"], "mobile refresh must echo the new refresh token in the body")

	// Logout revokes the session immediately (not after the 60s cache TTL).
	newAccessToken := loginBody["access_token"].(string)
	rec = doJSON(t, server, http.MethodPost, "/v1/auth/logout", nil, map[string]string{"Authorization": "Bearer " + newAccessToken})
	require.Equal(t, http.StatusNoContent, rec.Code)

	rec = doJSON(t, server, http.MethodGet, "/v1/me", nil, map[string]string{"Authorization": "Bearer " + newAccessToken})
	require.Equal(t, http.StatusUnauthorized, rec.Code, "a logged-out session must be rejected immediately")
}

func TestMePermissionsIncludeActiveDuty(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	q := db.New(pg.AdminPool)

	tenantID, userID := seedTenantWithUser(t, ctx, pg.AdminPool, "duty-tenant", "teacher1", "Password123!", []string{authz.PermViewDashboard})

	year, err := q.CreateAcademicYear(ctx, db.CreateAcademicYearParams{
		TenantID: tenantID, Label: "2026/2027",
		StartsOn: database.Date(time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)),
		EndsOn:   database.Date(time.Date(2027, 6, 1, 0, 0, 0, 0, time.UTC)),
		IsActive: true,
	})
	require.NoError(t, err)

	dutyType, err := q.CreateDutyType(ctx, db.CreateDutyTypeParams{TenantID: tenantID, Slug: "homeroom", Name: "Wali Kelas", ScopeKind: "school"})
	require.NoError(t, err)
	require.NoError(t, q.AddDutyPermission(ctx, db.AddDutyPermissionParams{DutyTypeID: dutyType.ID, PermissionCode: authz.PermReviewLeaveRequests, TenantID: tenantID}))
	_, err = q.CreateDutyAssignment(ctx, db.CreateDutyAssignmentParams{
		TenantID: tenantID, AcademicYearID: year.ID, DutyTypeID: dutyType.ID, UserID: userID,
		StartsOn: database.Date(time.Now().AddDate(0, 0, -1)),
	})
	require.NoError(t, err)

	server := newTestServer(t, pg.DSN, pg.AppPool)
	rec := doJSON(t, server, http.MethodPost, "/v1/auth/login", map[string]any{
		"username": "teacher1", "password": "Password123!", "client": "web",
	}, nil)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	var body map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	user := body["user"].(map[string]any)
	perms := toStringSlice(user["permissions"])

	require.Contains(t, perms, authz.PermViewDashboard, "role permission must be present")
	require.Contains(t, perms, authz.PermReviewLeaveRequests, "active duty permission must be unioned in")
}

func toStringSlice(v any) []string {
	raw := v.([]any)
	out := make([]string, len(raw))
	for i, x := range raw {
		out[i] = x.(string)
	}
	return out
}

// TestTenantIsolationRLS proves the RLS policies themselves deny
// cross-tenant reads even when a query has no WHERE tenant_id clause --
// the exact "buggy query" scenario the isolation model exists to catch.
// It connects as app_rw, the same non-superuser, non-BYPASSRLS role every
// production deployment runs as (dbtest.Postgres.AppPool), never as the
// migration role, which (like any Postgres superuser) always bypasses RLS
// regardless of FORCE ROW LEVEL SECURITY.
func TestTenantIsolationRLS(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()

	tenantA, _ := seedTenantWithUser(t, ctx, pg.AdminPool, "isolation-a", "usera", "Password123!", nil)
	tenantB, _ := seedTenantWithUser(t, ctx, pg.AdminPool, "isolation-b", "userb", "Password123!", nil)

	_, err := pg.AppPool.Exec(ctx, "select set_config('app.tenant_id', $1, false)", tenantA.String())
	require.NoError(t, err)

	// The "buggy query": no WHERE tenant_id at all.
	rows, err := pg.AppPool.Query(ctx, "select id, tenant_id from users")
	require.NoError(t, err)
	var seenTenants []string
	for rows.Next() {
		var id, tid pgtype.UUID
		require.NoError(t, rows.Scan(&id, &tid))
		u, _ := uuid.FromBytes(tid.Bytes[:])
		seenTenants = append(seenTenants, u.String())
	}
	rows.Close()

	for _, tid := range seenTenants {
		require.NotEqual(t, tenantB.String(), tid, "RLS must never leak tenant B's rows into tenant A's context")
	}
	require.NotEmpty(t, seenTenants, "tenant A's own user must still be visible")
}
