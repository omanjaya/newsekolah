package main

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// moduleGateProbes names one authenticated GET per toggleable module that
// takes no required parameters, so the only way it can answer 403
// MODULE_DISABLED is the central gate.
var moduleGateProbes = []struct{ module, path string }{
	{"library", "/v1/library/titles"},
	{"discipline", "/v1/discipline/violation-types"},
	{"grading", "/v1/grading/grade-ranges"},
	{"permits", "/v1/exit-permits"},
	{"announcements", "/v1/announcements"},
	{"reports", "/v1/reports"},
	{"activities", "/v1/activities/extracurriculars"},
	{"mentoring", "/v1/mentoring/groups"},
	{"supervision", "/v1/supervision/cycles"},
	{"staff_attendance", "/v1/staff-attendance/roster"},
	{"visitors", "/v1/visitors/board"},
	{"billing", "/v1/billing/fee-types"},
}

func errorCode(t *testing.T, body []byte) string {
	t.Helper()
	var envelope struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		return ""
	}
	return envelope.Error.Code
}

func TestModuleGateRefusesEveryDisabledModule(t *testing.T) {
	// A zero TTL makes the flag cache reload on every request, so the
	// direct SQL toggles below are seen at once (the console path that
	// invalidates the cache is covered by the platform service test).
	previousTTL := moduleFlagCacheTTL
	moduleFlagCacheTTL = 0
	t.Cleanup(func() { moduleFlagCacheTTL = previousTTL })

	pg := dbtest.Start(t)
	ctx := context.Background()
	q := db.New(pg.AdminPool)

	tenantID, _ := seedTenantWithUser(t, ctx, pg.AdminPool, "gate-tenant", "gateuser", "Password123!", []string{
		authz.PermViewLibrary, authz.PermViewDiscipline, authz.PermViewGrades, authz.PermViewAnnouncements,
		authz.PermViewActivities, authz.PermViewMentoring, authz.PermViewSupervision,
		authz.PermViewStaffAttendance, authz.PermViewVisitors, authz.PermViewBilling,
		authz.PermManageReportSchedules, authz.PermViewAcademicData,
	})
	server := newTestServer(t, pg.DSN, pg.AppPool)

	rec := doJSON(t, server, http.MethodPost, "/v1/auth/login", map[string]any{
		"username": "gateuser", "password": "Password123!", "client": "ios",
	}, nil)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var login map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &login))
	auth := map[string]string{"Authorization": "Bearer " + login["access_token"].(string)}

	setFlag := func(module string, enabled bool) {
		t.Helper()
		_, err := q.PlatformUpsertFeatureFlag(ctx, db.PlatformUpsertFeatureFlagParams{TenantID: tenantID, Module: module, Enabled: enabled})
		require.NoError(t, err)
	}
	get := func(path string, headers map[string]string) (int, string) {
		rec := doJSON(t, server, http.MethodGet, path, nil, headers)
		return rec.Code, errorCode(t, rec.Body.Bytes())
	}

	// Baseline: every module is on (no rows), so no probe is gated.
	for _, probe := range moduleGateProbes {
		_, code := get(probe.path, auth)
		require.NotEqual(t, "MODULE_DISABLED", code, "%s should be enabled by default", probe.module)
	}

	for _, probe := range moduleGateProbes {
		setFlag(probe.module, false)
	}
	for _, probe := range moduleGateProbes {
		status, code := get(probe.path, auth)
		require.Equal(t, http.StatusForbidden, status, "%s %s", probe.module, probe.path)
		require.Equal(t, "MODULE_DISABLED", code, "%s %s", probe.module, probe.path)
	}

	// A public operation of a gated module is refused too (library OPAC).
	status, code := get("/v1/opac/highlights", nil)
	require.Equal(t, http.StatusForbidden, status)
	require.Equal(t, "MODULE_DISABLED", code)

	// Operations outside the 12 modules are untouched while all are off.
	status, code = get("/v1/academic/years", auth)
	require.Equal(t, http.StatusOK, status)
	require.Empty(t, code)
	status, _ = get("/v1/me", auth)
	require.Equal(t, http.StatusOK, status)

	// An unauthenticated caller still gets 401 from authz, not the gate.
	status, code = get("/v1/library/titles", nil)
	require.Equal(t, http.StatusUnauthorized, status)
	require.NotEqual(t, "MODULE_DISABLED", code)

	for _, probe := range moduleGateProbes {
		setFlag(probe.module, true)
	}
	for _, probe := range moduleGateProbes {
		_, code := get(probe.path, auth)
		require.NotEqual(t, "MODULE_DISABLED", code, "%s should pass again once re-enabled", probe.module)
	}
	_, code = get("/v1/opac/highlights", nil)
	require.NotEqual(t, "MODULE_DISABLED", code)
}
