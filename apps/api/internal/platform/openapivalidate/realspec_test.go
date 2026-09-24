package openapivalidate

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
)

// TestNewMiddleware_RealSpecBuildsAndDecomposesLoginErrors exercises the
// middleware against the actual bundled spec (openapi/openapi.yaml, via
// api.GetSpec -- the same doc cmd/api/wire.go passes to NewMiddleware),
// not a synthetic one: NewMiddleware must build a router over the whole
// document without error, and a request missing several required
// LoginRequest fields must come back as one detail per field.
func TestNewMiddleware_RealSpecBuildsAndDecomposesLoginErrors(t *testing.T) {
	doc, err := api.GetSpec()
	if err != nil {
		t.Fatalf("api.GetSpec: %v", err)
	}

	mw, err := NewMiddleware(doc, ModeEnforce, discardLogger())
	if err != nil {
		t.Fatalf("NewMiddleware over the real spec: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/v1/auth/login", strings.NewReader(`{"client":"web"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mw(echoNext(new(bool))).ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
	assertErrorDetail(t, rec.Body.Bytes(), "body.username", "REQUIRED")
	assertErrorDetail(t, rec.Body.Bytes(), "body.password", "REQUIRED")
}

// TestNewMiddleware_RealSpecSkipsUndocumentedAndHealthRoutes confirms the
// two route categories the task calls out by name behave as documented:
// /health is a real spec operation with no params, so it always passes; an
// arbitrary undocumented path is skipped outright.
func TestNewMiddleware_RealSpecSkipsUndocumentedAndHealthRoutes(t *testing.T) {
	doc, err := api.GetSpec()
	if err != nil {
		t.Fatalf("api.GetSpec: %v", err)
	}
	mw, err := NewMiddleware(doc, ModeEnforce, discardLogger())
	if err != nil {
		t.Fatalf("NewMiddleware over the real spec: %v", err)
	}

	for _, path := range []string{"/health", "/not-a-documented-route"} {
		var reached bool
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rec := httptest.NewRecorder()
		mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			reached = true
			_, _ = io.ReadAll(r.Body)
			w.WriteHeader(http.StatusOK)
		})).ServeHTTP(rec, req)

		if !reached {
			t.Errorf("%s: expected the request to reach the handler", path)
		}
		if rec.Code != http.StatusOK {
			t.Errorf("%s: expected 200, got %d: %s", path, rec.Code, rec.Body.String())
		}
	}
}
