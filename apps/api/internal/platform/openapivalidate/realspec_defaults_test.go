package openapivalidate

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
)

// TestNewMiddleware_RealSpecLeavesOptionalFiltersUnset is the regression
// test for the counselors' "Tim BK" list showing only "Masalah" notes: the
// shared CounselingTopic schema carried `default: problem`, and the
// validator wrote that default into the request whenever the optional
// topic filter was absent, so the handler always filtered by it.
func TestNewMiddleware_RealSpecLeavesOptionalFiltersUnset(t *testing.T) {
	doc, err := api.GetSpec()
	if err != nil {
		t.Fatalf("api.GetSpec: %v", err)
	}
	mw, err := NewMiddleware(doc, ModeEnforce, discardLogger())
	if err != nil {
		t.Fatalf("NewMiddleware over the real spec: %v", err)
	}

	var topic string
	var reached bool
	req := httptest.NewRequest(http.MethodGet, "/v1/discipline/counselings/bk-team?limit=50&offset=0", nil)
	rec := httptest.NewRecorder()
	mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached = true
		topic = r.URL.Query().Get("topic")
		w.WriteHeader(http.StatusOK)
	})).ServeHTTP(rec, req)

	if !reached {
		t.Fatalf("expected the request to reach the handler, got %d: %s", rec.Code, rec.Body.String())
	}
	if topic != "" {
		t.Fatalf("the validator filled in topic=%q; an unfiltered list must stay unfiltered", topic)
	}
}
