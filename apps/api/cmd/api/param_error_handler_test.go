package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

type paramErrorEnvelope struct {
	Error struct {
		Code    string              `json:"code"`
		Message string              `json:"message"`
		Details []httpx.ErrorDetail `json:"details"`
	} `json:"error"`
}

// newParamErrorRouter mounts the generated chi wrapper the same way wire.go
// does, over the generated Unimplemented server, so a request that binds
// cleanly reaches a 501 and one that does not is answered by
// paramErrorHandler.
func newParamErrorRouter() http.Handler {
	router := chi.NewRouter()
	api.HandlerWithOptions(api.Unimplemented{}, api.ChiServerOptions{
		BaseRouter:       router,
		ErrorHandlerFunc: paramErrorHandler,
	})
	return router
}

func decodeParamError(t *testing.T, rec *httptest.ResponseRecorder) paramErrorEnvelope {
	t.Helper()
	require.Contains(t, rec.Header().Get("Content-Type"), "application/json")
	var env paramErrorEnvelope
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &env))
	return env
}

func TestParamErrorHandler_MalformedPathUUIDReturnsValidationEnvelope(t *testing.T) {
	rec := httptest.NewRecorder()
	newParamErrorRouter().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/v1/leave-requests/abc", nil))

	require.Equal(t, http.StatusBadRequest, rec.Code)
	env := decodeParamError(t, rec)
	require.Equal(t, "VALIDATION_FAILED", env.Error.Code)
	require.NotEmpty(t, env.Error.Message)
	require.Equal(t, []httpx.ErrorDetail{{Field: "instanceId", Code: "INVALID_FORMAT"}}, env.Error.Details)
}

func TestParamErrorHandler_MalformedQueryParamReturnsValidationEnvelope(t *testing.T) {
	rec := httptest.NewRecorder()
	newParamErrorRouter().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/v1/leave-requests?limit=many", nil))

	require.Equal(t, http.StatusBadRequest, rec.Code)
	env := decodeParamError(t, rec)
	require.Equal(t, "VALIDATION_FAILED", env.Error.Code)
	require.Equal(t, []httpx.ErrorDetail{{Field: "limit", Code: "INVALID_FORMAT"}}, env.Error.Details)
}

func TestParamErrorHandler_WellFormedPathReachesTheHandler(t *testing.T) {
	rec := httptest.NewRecorder()
	newParamErrorRouter().ServeHTTP(rec, httptest.NewRequest(http.MethodGet,
		"/v1/leave-requests/6f1c2b2e-1d2a-4c47-9f51-1a0b1c2d3e4f", nil))

	require.Equal(t, http.StatusNotImplemented, rec.Code)
}

func TestParamErrorDetail_MapsEveryGeneratedBindError(t *testing.T) {
	cause := errors.New("boom")
	cases := []struct {
		name string
		err  error
		want httpx.ErrorDetail
	}{
		{"invalid format", &api.InvalidParamFormatError{ParamName: "id", Err: cause}, httpx.ErrorDetail{Field: "id", Code: "INVALID_FORMAT"}},
		{"required query", &api.RequiredParamError{ParamName: "q"}, httpx.ErrorDetail{Field: "q", Code: "REQUIRED"}},
		{"required header", &api.RequiredHeaderError{ParamName: "X-Key", Err: cause}, httpx.ErrorDetail{Field: "X-Key", Code: "REQUIRED"}},
		{"unmarshaling", &api.UnmarshalingParamError{ParamName: "filter", Err: cause}, httpx.ErrorDetail{Field: "filter", Code: "INVALID_FORMAT"}},
		{"too many values", &api.TooManyValuesForParamError{ParamName: "page", Count: 2}, httpx.ErrorDetail{Field: "page", Code: "INVALID"}},
		{"cookie", &api.UnescapedCookieParamError{ParamName: "sid", Err: cause}, httpx.ErrorDetail{Field: "sid", Code: "INVALID_FORMAT"}},
		{"unknown", cause, httpx.ErrorDetail{Code: "INVALID"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			require.Equal(t, tc.want, paramErrorDetail(tc.err))
		})
	}
}
