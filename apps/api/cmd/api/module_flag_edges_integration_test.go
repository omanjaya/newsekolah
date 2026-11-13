package main

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// TestPublicBrandingCarriesDisabledPublicModules covers the public branding
// view's disabled_public_modules: always present, listing only the public
// modules (library) that are off, never the rest of the disabled list.
func TestPublicBrandingCarriesDisabledPublicModules(t *testing.T) {
	pg := dbtest.Start(t)
	h := newFlagHarness(t, pg, "public-branding", []string{authz.PermViewDashboard})
	// Anonymous: single-tenant mode resolves the only school without a header.
	var tenantHeader map[string]string

	publicModules := func() []any {
		t.Helper()
		status, body, _, _ := h.do(http.MethodGet, "/v1/tenant/branding", nil, tenantHeader)
		require.Equal(t, http.StatusOK, status, body)
		modules, ok := body["disabled_public_modules"].([]any)
		require.True(t, ok, "disabled_public_modules must always be present: %v", body)
		return modules
	}
	meModules := func() []any {
		t.Helper()
		status, body, _, _ := h.do(http.MethodGet, "/v1/me", nil, h.auth)
		require.Equal(t, http.StatusOK, status)
		return body["tenant"].(map[string]any)["disabled_public_modules"].([]any)
	}

	require.Empty(t, publicModules())
	h.setFlag("billing", false)
	h.setFlag("discipline", false)
	require.Empty(t, publicModules(), "modules without public pages are never exposed anonymously")

	h.setFlag("library", false)
	require.Equal(t, []any{"library"}, publicModules())
	require.Equal(t, []any{"library"}, meModules())
	status, _, code, _ := h.do(http.MethodGet, "/v1/opac/titles", nil, tenantHeader)
	require.Equal(t, http.StatusForbidden, status)
	require.Equal(t, "MODULE_DISABLED", code, "the OPAC endpoints the field stands for are refused")

	h.setFlag("library", true)
	require.Empty(t, publicModules())
}

func createTemplate(h *flagHarness, kind string) (int, map[string]any) {
	h.t.Helper()
	status, body, _, _ := h.do(http.MethodPost, "/v1/documents/templates", map[string]any{
		"kind": kind, "name": "Templat " + kind, "body": "<p>{{.Number}}</p>",
	}, h.auth)
	return status, body
}

func templateKinds(t *testing.T, h *flagHarness) []string {
	t.Helper()
	status, body, code, _ := h.do(http.MethodGet, "/v1/documents/templates", nil, h.auth)
	require.Equal(t, http.StatusOK, status, code)
	kinds := []string{}
	for _, item := range body["data"].([]any) {
		kinds = append(kinds, item.(map[string]any)["kind"].(string))
	}
	return kinds
}

// TestDocumentTemplatesFollowTheirKindsOwner covers document templates as
// shared infrastructure: the operations are not gated by permits as a
// whole, but a kind whose owner module is off is left out of the list and
// refused with 403 MODULE_DISABLED naming that module. Workflow
// definitions drive permits' flows only and stay gated by permits.
func TestDocumentTemplatesFollowTheirKindsOwner(t *testing.T) {
	pg := dbtest.Start(t)
	h := newFlagHarness(t, pg, "doc-templates", []string{authz.PermManageSettings, authz.PermManageWorkflows})

	status, leave := createTemplate(h, "leave_letter")
	require.Equal(t, http.StatusCreated, status, leave)
	status, warning := createTemplate(h, "warning_letter")
	require.Equal(t, http.StatusCreated, status, warning)
	require.ElementsMatch(t, []string{"leave_letter", "warning_letter"}, templateKinds(t, h))

	h.setFlag("permits", false)
	require.Equal(t, []string{"warning_letter"}, templateKinds(t, h), "permits off: the screen still works for discipline's kind")
	status, created := createTemplate(h, "warning_letter")
	require.Equal(t, http.StatusCreated, status, created)
	h.requireModuleDisabled(http.MethodPost, "/v1/documents/templates", map[string]any{
		"kind": "leave_letter", "name": "Surat izin", "body": "<p>x</p>",
	}, "permits")
	leaveID := leave["id"].(string)
	h.requireModuleDisabled(http.MethodPut, "/v1/documents/templates/"+leaveID, map[string]any{"name": "Baru", "body": "<p>y</p>"}, "permits")
	h.requireModuleDisabled(http.MethodPost, "/v1/documents/templates/"+leaveID+"/set-default", nil, "permits")

	_, _, code, _ := h.do(http.MethodGet, "/v1/workflows/definitions", nil, h.auth)
	require.Equal(t, "MODULE_DISABLED", code, "workflow definitions stay permits-only")

	h.setFlag("discipline", false)
	require.Empty(t, templateKinds(t, h))
	h.requireModuleDisabled(http.MethodPost, "/v1/documents/templates", map[string]any{
		"kind": "warning_letter", "name": "SP", "body": "<p>x</p>",
	}, "discipline")

	h.setFlag("permits", true)
	h.setFlag("discipline", true)
	require.ElementsMatch(t, []string{"leave_letter", "warning_letter", "warning_letter"}, templateKinds(t, h), "kept templates come back")
	status, _, code, _ = h.do(http.MethodPut, "/v1/documents/templates/"+leaveID, map[string]any{"name": "Baru", "body": "<p>y</p>"}, h.auth)
	require.Equal(t, http.StatusOK, status, code)
}
