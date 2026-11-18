package main

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	platformdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

type consoleFlag struct {
	Module  string `json:"module"`
	Enabled bool   `json:"enabled"`
}

func requireConsoleFlags(t *testing.T, flags []consoleFlag, disabled string) {
	t.Helper()
	require.Len(t, flags, len(platformdomain.AllModules))
	for i, f := range flags {
		require.Equal(t, string(platformdomain.AllModules[i]), f.Module)
		require.Equal(t, f.Module != disabled, f.Enabled, f.Module)
	}
}

// TestPlatformConsoleInSingleTenantMode drives the superadmin console
// through the full HTTP stack (auth, OpenAPI request validation in enforce
// mode, authz, the module gate) in TENANCY_MODE=single, how production
// runs: the school is listed, every one of the twelve modules can be read
// and toggled (visitors included, which the request validator used to
// reject), the toggle takes effect at once, and the multi-tenant-only
// actions answer 409 PLATFORM_TENANCY_DISABLED.
func TestPlatformConsoleInSingleTenantMode(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	tenantID, _ := seedTenantWithUser(t, ctx, pg.AdminPool, "console-single", "superadmin", "Password123!",
		[]string{authz.PermPlatformSuperadmin, authz.PermViewVisitors})
	server := newTestServer(t, pg.DSN, pg.AppPool)
	auth := map[string]string{"Authorization": "Bearer " + loginAndGetAccessToken(t, server, "superadmin", "Password123!")}
	tenantPath := "/v1/platform/tenants/" + tenantID.String()

	rec := doJSON(t, server, http.MethodGet, "/v1/platform/tenants", nil, auth)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var list struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
		TenancyMode string `json:"tenancy_mode"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &list))
	require.Len(t, list.Data, 1)
	require.Equal(t, tenantID.String(), list.Data[0].ID)
	require.Equal(t, "single", list.TenancyMode)

	rec = doJSON(t, server, http.MethodGet, tenantPath+"/flags", nil, auth)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var flags struct {
		Data []consoleFlag `json:"data"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &flags))
	requireConsoleFlags(t, flags.Data, "")

	rec = doJSON(t, server, http.MethodGet, "/v1/visitors/board", nil, auth)
	require.NotEqual(t, "MODULE_DISABLED", errorCode(t, rec.Body.Bytes()))

	rec = doJSON(t, server, http.MethodPut, tenantPath+"/flags/visitors", map[string]any{"enabled": false}, auth)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var flag consoleFlag
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &flag))
	require.Equal(t, consoleFlag{Module: "visitors", Enabled: false}, flag)

	rec = doJSON(t, server, http.MethodGet, "/v1/visitors/board", nil, auth)
	require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())
	require.Equal(t, "MODULE_DISABLED", errorCode(t, rec.Body.Bytes()), "the console toggle invalidates the flag cache")

	rec = doJSON(t, server, http.MethodGet, tenantPath, nil, auth)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var detail struct {
		Flags []consoleFlag `json:"flags"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &detail))
	requireConsoleFlags(t, detail.Flags, "visitors")

	otherPath := "/v1/platform/tenants/" + uuid.New().String()
	rec = doJSON(t, server, http.MethodGet, otherPath+"/flags", nil, auth)
	require.Equal(t, http.StatusNotFound, rec.Code, rec.Body.String())
	rec = doJSON(t, server, http.MethodPut, otherPath+"/flags/visitors", map[string]any{"enabled": false}, auth)
	require.Equal(t, http.StatusNotFound, rec.Code, rec.Body.String())

	refused := []struct {
		method, path string
		body         any
	}{
		{http.MethodPost, tenantPath + "/suspend", nil},
		{http.MethodPost, tenantPath + "/resume", nil},
		{http.MethodPut, tenantPath + "/domain", map[string]any{"domain": "school.example.com"}},
		{http.MethodPost, tenantPath + "/exports", nil},
	}
	for _, r := range refused {
		rec = doJSON(t, server, r.method, r.path, r.body, auth)
		require.Equal(t, http.StatusConflict, rec.Code, "%s %s: %s", r.method, r.path, rec.Body.String())
		require.Equal(t, "PLATFORM_TENANCY_DISABLED", errorCode(t, rec.Body.Bytes()), "%s %s", r.method, r.path)
	}

	rec = doJSON(t, server, http.MethodPut, tenantPath+"/flags/visitors", map[string]any{"enabled": true}, auth)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
}
