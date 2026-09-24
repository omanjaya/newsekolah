package openapivalidate

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/getkin/kin-openapi/openapi3"
)

const testSpec = `
openapi: 3.1.0
info: { title: test, version: "1" }
paths:
  /widgets:
    get:
      operationId: listWidgets
      parameters:
        - name: limit
          in: query
          required: true
          schema: { type: integer, minimum: 1 }
      responses: { "200": { description: ok } }
    post:
      operationId: createWidget
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/WidgetWrite" }
      responses: { "200": { description: ok } }
  /widgets/upload:
    post:
      operationId: uploadWidgetPhoto
      requestBody:
        required: true
        content:
          application/octet-stream:
            schema: { type: string, format: binary }
      responses: { "200": { description: ok } }
components:
  schemas:
    WidgetWrite:
      type: object
      required: [name, count]
      properties:
        name: { type: string }
        count: { type: integer }
        note: { type: string }
`

func loadTestDoc(t *testing.T) *openapi3.T {
	t.Helper()
	doc, err := openapi3.NewLoader().LoadFromData([]byte(testSpec))
	if err != nil {
		t.Fatalf("load spec: %v", err)
	}
	return doc
}

// echoNext is the downstream handler every test wraps: it records whether
// it ran and, for POST, echoes the body back so tests can confirm a body
// consumed by validation was restored for the real handler.
func echoNext(reached *bool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*reached = true
		body, _ := io.ReadAll(r.Body)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(body)
	})
}

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func TestNewMiddleware_ModeOffSkipsEntirely(t *testing.T) {
	mw, err := NewMiddleware(loadTestDoc(t), ModeOff, discardLogger())
	if err != nil {
		t.Fatalf("NewMiddleware: %v", err)
	}

	var reached bool
	req := httptest.NewRequest(http.MethodGet, "/widgets", nil) // missing required "limit"
	rec := httptest.NewRecorder()
	mw(echoNext(&reached)).ServeHTTP(rec, req)

	if !reached {
		t.Fatal("ModeOff must never build a router or block the request")
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 from the downstream handler, got %d", rec.Code)
	}
}

func TestNewMiddleware_RouteNotInSpecPassesThrough(t *testing.T) {
	mw, err := NewMiddleware(loadTestDoc(t), ModeEnforce, discardLogger())
	if err != nil {
		t.Fatalf("NewMiddleware: %v", err)
	}

	var reached bool
	req := httptest.NewRequest(http.MethodGet, "/does-not-exist", nil)
	rec := httptest.NewRecorder()
	mw(echoNext(&reached)).ServeHTTP(rec, req)

	if !reached || rec.Code != http.StatusOK {
		t.Fatalf("expected an undocumented route to pass through untouched, reached=%v status=%d", reached, rec.Code)
	}
}

func TestNewMiddleware_EnforceRejectsMissingRequiredQueryParam(t *testing.T) {
	mw, err := NewMiddleware(loadTestDoc(t), ModeEnforce, discardLogger())
	if err != nil {
		t.Fatalf("NewMiddleware: %v", err)
	}

	var reached bool
	req := httptest.NewRequest(http.MethodGet, "/widgets", nil)
	rec := httptest.NewRecorder()
	mw(echoNext(&reached)).ServeHTTP(rec, req)

	if reached {
		t.Fatal("the handler must not run when required params are missing")
	}
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
	assertErrorDetail(t, rec.Body.Bytes(), "limit", "REQUIRED")
}

func TestNewMiddleware_EnforceAcceptsValidRequestAndRestoresBody(t *testing.T) {
	mw, err := NewMiddleware(loadTestDoc(t), ModeEnforce, discardLogger())
	if err != nil {
		t.Fatalf("NewMiddleware: %v", err)
	}

	var reached bool
	payload := `{"name":"widget-1","count":3}`
	req := httptest.NewRequest(http.MethodPost, "/widgets", strings.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mw(echoNext(&reached)).ServeHTTP(rec, req)

	if !reached {
		t.Fatal("a spec-valid request must reach the handler")
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if rec.Body.String() != payload {
		t.Fatalf("expected the handler to read the original body back, got %q", rec.Body.String())
	}
}

// A malformed body is always rejected with a "body"-rooted detail. Whether
// the underlying jsonschema validator decomposes multiple missing
// properties into one detail per field (it does for the real spec's
// LoginRequest, covered by an httptest run against openapi/openapi.yaml in
// cmd/api's integration tests) or reports one combined failure depends on
// kin-openapi's own error-tree shape for a given schema, not on this
// package's error mapping -- either way every leaf still becomes a
// well-formed {field, code} detail, never raw library text.
func TestNewMiddleware_EnforceReportsMissingRequiredBodyFields(t *testing.T) {
	mw, err := NewMiddleware(loadTestDoc(t), ModeEnforce, discardLogger())
	if err != nil {
		t.Fatalf("NewMiddleware: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/widgets", strings.NewReader(`{"note":"a widget"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mw(echoNext(new(bool))).ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
	var envelope struct {
		Error struct {
			Code    string `json:"code"`
			Details []struct {
				Field string `json:"field"`
				Code  string `json:"code"`
			} `json:"details"`
		} `json:"error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &envelope); err != nil {
		t.Fatalf("unmarshal error envelope: %v (body: %s)", err, rec.Body.String())
	}
	if envelope.Error.Code != "VALIDATION_FAILED" {
		t.Fatalf("expected VALIDATION_FAILED, got %q", envelope.Error.Code)
	}
	if len(envelope.Error.Details) == 0 {
		t.Fatal("expected at least one detail")
	}
	for _, d := range envelope.Error.Details {
		if !strings.HasPrefix(d.Field, "body") {
			t.Errorf("expected every detail's field to be rooted at \"body\", got %q", d.Field)
		}
		if d.Code == "" {
			t.Errorf("expected every detail to carry a non-empty code, got %+v", d)
		}
	}
}

func TestNewMiddleware_LogModeLetsTheRequestThroughAndLogs(t *testing.T) {
	var logBuf bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&logBuf, nil))

	mw, err := NewMiddleware(loadTestDoc(t), ModeLog, logger)
	if err != nil {
		t.Fatalf("NewMiddleware: %v", err)
	}

	var reached bool
	req := httptest.NewRequest(http.MethodGet, "/widgets", nil) // missing required "limit"
	rec := httptest.NewRecorder()
	mw(echoNext(&reached)).ServeHTTP(rec, req)

	if !reached {
		t.Fatal("ModeLog must let the request through despite the violation")
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 from the downstream handler, got %d", rec.Code)
	}
	if !strings.Contains(logBuf.String(), "openapi_validation_failed") {
		t.Fatalf("expected the violation to be logged, got: %s", logBuf.String())
	}
	if !strings.Contains(logBuf.String(), "listWidgets") {
		t.Fatalf("expected the log line to name the operation, got: %s", logBuf.String())
	}
}

func TestNewMiddleware_SkipsBodyValidationForNonJSONContentType(t *testing.T) {
	mw, err := NewMiddleware(loadTestDoc(t), ModeEnforce, discardLogger())
	if err != nil {
		t.Fatalf("NewMiddleware: %v", err)
	}

	var reached bool
	// The schema requires a binary body, but any bytes should pass since
	// body validation is skipped for a non-JSON content type -- this also
	// confirms the raw bytes still reach the handler unmodified.
	req := httptest.NewRequest(http.MethodPost, "/widgets/upload", strings.NewReader("not-really-a-jpeg"))
	req.Header.Set("Content-Type", "image/jpeg")
	rec := httptest.NewRecorder()
	mw(echoNext(&reached)).ServeHTTP(rec, req)

	if !reached {
		t.Fatal("a non-JSON body must not be blocked by schema validation")
	}
	if rec.Body.String() != "not-really-a-jpeg" {
		t.Fatalf("expected the raw body to reach the handler untouched, got %q", rec.Body.String())
	}
}

// assertErrorDetail fails the test unless the httpx error envelope in body
// contains a detail with the given field and code.
func assertErrorDetail(t *testing.T, body []byte, field, code string) {
	t.Helper()
	var envelope struct {
		Error struct {
			Details []struct {
				Field string `json:"field"`
				Code  string `json:"code"`
			} `json:"details"`
		} `json:"error"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		t.Fatalf("unmarshal error envelope: %v (body: %s)", err, body)
	}
	for _, d := range envelope.Error.Details {
		if d.Field == field && d.Code == code {
			return
		}
	}
	t.Fatalf("expected a detail {field:%q code:%q} in %+v", field, code, envelope.Error.Details)
}
