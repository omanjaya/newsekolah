package main

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// flagHarness is one tenant, one signed-in user and a router whose module
// gate reloads flags on every request, so plain SQL toggles apply at once.
type flagHarness struct {
	t        *testing.T
	ctx      context.Context
	server   http.Handler
	tenantID uuid.UUID
	userID   uuid.UUID
	auth     map[string]string
	q        *db.Queries
}

func newFlagHarness(t *testing.T, pg dbtest.Postgres, slug string, permissions []string) *flagHarness {
	t.Helper()
	previousTTL := moduleFlagCacheTTL
	moduleFlagCacheTTL = 0
	t.Cleanup(func() { moduleFlagCacheTTL = previousTTL })

	ctx := context.Background()
	tenantID, userID := seedTenantWithUser(t, ctx, pg.AdminPool, slug, slug+"-user", "Password123!", permissions)
	server := newTestServer(t, pg.DSN, pg.AppPool)
	rec := doJSON(t, server, http.MethodPost, "/v1/auth/login", map[string]any{
		"username": slug + "-user", "password": "Password123!", "client": "ios",
	}, nil)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var login map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &login))
	return &flagHarness{
		t: t, ctx: ctx, server: server, tenantID: tenantID, userID: userID, q: db.New(pg.AdminPool),
		auth: map[string]string{"Authorization": "Bearer " + login["access_token"].(string)},
	}
}

func (h *flagHarness) setFlag(module string, enabled bool) {
	h.t.Helper()
	_, err := h.q.PlatformUpsertFeatureFlag(h.ctx, db.PlatformUpsertFeatureFlagParams{TenantID: h.tenantID, Module: module, Enabled: enabled})
	require.NoError(h.t, err)
}

// do sends one request and returns the status, the decoded body and the
// error envelope's code and details.
func (h *flagHarness) do(method, path string, body any, headers map[string]string) (int, map[string]any, string, []map[string]any) {
	h.t.Helper()
	rec := doJSON(h.t, h.server, method, path, body, headers)
	var decoded map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &decoded)
	var envelope struct {
		Error struct {
			Code    string           `json:"code"`
			Details []map[string]any `json:"details"`
		} `json:"error"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &envelope)
	return rec.Code, decoded, envelope.Error.Code, envelope.Error.Details
}

func (h *flagHarness) requireModuleDisabled(method, path string, body any, module string) {
	h.t.Helper()
	status, _, code, details := h.do(method, path, body, h.auth)
	require.Equal(h.t, http.StatusForbidden, status, "%s %s", method, path)
	require.Equal(h.t, "MODULE_DISABLED", code, "%s %s", method, path)
	require.Equal(h.t, []map[string]any{{"field": "module", "code": module}}, details, "%s %s", method, path)
}

func reportKinds(t *testing.T, h *flagHarness) []string {
	t.Helper()
	status, body, _, _ := h.do(http.MethodGet, "/v1/reports", nil, h.auth)
	require.Equal(t, http.StatusOK, status)
	var kinds []string
	for _, item := range body["data"].([]any) {
		kinds = append(kinds, item.(map[string]any)["kind"].(string))
	}
	return kinds
}

func scheduleIDs(t *testing.T, h *flagHarness) []string {
	t.Helper()
	status, body, _, _ := h.do(http.MethodGet, "/v1/reports/schedules", nil, h.auth)
	require.Equal(t, http.StatusOK, status)
	ids := []string{}
	for _, item := range body["data"].([]any) {
		ids = append(ids, item.(map[string]any)["id"].(string))
	}
	return ids
}

// TestReportKindsFollowTheirSourceModule covers every place the report
// centre uses a kind: a kind whose source module is off leaves the
// catalogue and is refused with 403 MODULE_DISABLED naming that module when
// asked for directly (export, columns, schedule create and update), and a
// schedule of such a kind leaves the list until the module is back.
func TestReportKindsFollowTheirSourceModule(t *testing.T) {
	pg := dbtest.Start(t)
	h := newFlagHarness(t, pg, "report-kinds", []string{
		authz.PermViewReports, authz.PermViewGrades, authz.PermViewDiscipline, authz.PermManageReportSchedules,
	})
	_, err := pg.AdminPool.Exec(h.ctx, `update users set email = 'kepala@sekolah.test' where id = $1`, h.userID)
	require.NoError(t, err)

	all := reportKinds(t, h)
	require.Contains(t, all, "grading.report_scores")
	require.Contains(t, all, "discipline.points")

	exportGrading := "/v1/reports/grading.report_scores/export?class_id=" + uuid.NewString() + "&subject_id=" + uuid.NewString()
	columnsGrading := "/v1/reports/grading.report_scores/columns?class_id=" + uuid.NewString() + "&subject_id=" + uuid.NewString()
	_, _, code, _ := h.do(http.MethodGet, exportGrading, nil, h.auth)
	require.NotEqual(t, "MODULE_DISABLED", code, "grading on: the export is not refused as disabled")

	schedule := map[string]any{"report_kind": "discipline.points", "cadence": "daily", "hour": 7, "recipients": []string{"kepala@sekolah.test"}}
	status, created, _, _ := h.do(http.MethodPost, "/v1/reports/schedules", schedule, h.auth)
	require.Equal(t, http.StatusCreated, status, created)
	scheduleID := created["id"].(string)
	require.Equal(t, []string{scheduleID}, scheduleIDs(t, h))

	h.setFlag("grading", false)
	h.setFlag("discipline", false)
	kinds := reportKinds(t, h)
	require.NotContains(t, kinds, "grading.report_scores")
	require.NotContains(t, kinds, "discipline.points")
	require.NotContains(t, kinds, "discipline.warning_letters")
	require.Contains(t, kinds, "attendance.daily", "kinds of always-on modules stay")
	require.Contains(t, kinds, "permits.leave_requests", "kinds of modules still on stay")

	// Previously a 500: grading's own sentinel was unmapped here.
	h.requireModuleDisabled(http.MethodGet, exportGrading, nil, "grading")
	h.requireModuleDisabled(http.MethodGet, columnsGrading, nil, "grading")
	h.requireModuleDisabled(http.MethodGet, "/v1/reports/discipline.points/export", nil, "discipline")
	h.requireModuleDisabled(http.MethodPost, "/v1/reports/schedules", schedule, "discipline")

	require.Empty(t, scheduleIDs(t, h), "a schedule of a switched-off kind leaves the list")
	h.requireModuleDisabled(http.MethodPut, "/v1/reports/schedules/"+scheduleID, map[string]any{
		"report_kind": "attendance.daily", "cadence": "daily", "hour": 8, "recipients": []string{"kepala@sekolah.test"},
	}, "discipline")
	h.requireModuleDisabled(http.MethodPut, "/v1/reports/schedules/"+scheduleID+"/enabled", map[string]any{"enabled": false}, "discipline")
	h.requireModuleDisabled(http.MethodGet, "/v1/reports/schedules/"+scheduleID+"/runs", nil, "discipline")
	h.requireModuleDisabled(http.MethodDelete, "/v1/reports/schedules/"+scheduleID, nil, "discipline")

	h.setFlag("grading", true)
	h.setFlag("discipline", true)
	require.ElementsMatch(t, all, reportKinds(t, h), "everything comes back once the modules are on again")
	require.Equal(t, []string{scheduleID}, scheduleIDs(t, h), "the kept schedule is listed again, untouched")
}
