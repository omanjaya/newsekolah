package openapivalidate

import (
	"fmt"
	"log/slog"
	"mime"
	"net/http"
	"strings"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/getkin/kin-openapi/openapi3filter"
	"github.com/getkin/kin-openapi/routers"
	"github.com/getkin/kin-openapi/routers/legacy"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

// NewMiddleware builds the spec router once from doc and returns a chi/net-http
// middleware that validates every matched request's path/query parameters
// and JSON body against it before the request reaches routing. mode is
// resolved once at startup (platform/config's OPENAPI_VALIDATION) and does
// not change per request.
//
// A request whose path+method is not in doc (a health-check probe hitting
// an undocumented path, a future route, a CORS preflight OPTIONS) is left
// alone: there is nothing in the spec to validate it against.
func NewMiddleware(doc *openapi3.T, mode Mode, logger *slog.Logger) (func(http.Handler) http.Handler, error) {
	if mode == ModeOff {
		return func(next http.Handler) http.Handler { return next }, nil
	}

	rtr, err := buildRouter(doc)
	if err != nil {
		return nil, err
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			route, pathParams, findErr := rtr.FindRoute(r)
			if findErr != nil {
				next.ServeHTTP(w, r)
				return
			}

			verr := validateAgainstSpec(r, route, pathParams)
			if verr == nil {
				next.ServeHTTP(w, r)
				return
			}
			handleViolation(w, r, next, route, verr, mode, logger)
		})
	}, nil
}

// buildRouter matches requests by path and method only, ignoring the
// spec's `servers:` entries. An incoming *http.Request's URL carries no
// scheme or host (net/http populates only the request-target: path and
// query), so matching against a server URL like "https://{host}" would
// reject every real request -- tenant routing already happens from the
// Host header via platform/tenant, not from the spec's server list.
func buildRouter(doc *openapi3.T) (routers.Router, error) {
	routerDoc := *doc
	routerDoc.Servers = nil

	rtr, err := legacy.NewRouter(&routerDoc)
	if err != nil {
		return nil, fmt.Errorf("openapivalidate: build router from spec: %w", err)
	}
	return rtr, nil
}

// validateAgainstSpec checks params and, for a JSON body, the body, using
// the already-resolved route so this does no path matching of its own.
// Authentication/authorization is a separate concern handled by
// cmd/api/authz_middleware.go once operationId is known further down the
// chain, so security requirements are accepted unconditionally here.
func validateAgainstSpec(r *http.Request, route *routers.Route, pathParams map[string]string) error {
	input := &openapi3filter.RequestValidationInput{
		Request:    r,
		PathParams: pathParams,
		Route:      route,
		Options: &openapi3filter.Options{
			AuthenticationFunc: openapi3filter.NoopAuthenticationFunc,
			MultiError:         true,
			ExcludeRequestBody: excludeRequestBody(r),
		},
	}
	return openapi3filter.ValidateRequest(r.Context(), input)
}

// excludeRequestBody skips schema validation for anything other than a
// JSON body: multipart uploads are costly to buffer and parse against a
// JSON schema for no benefit (the spec has no multipart operation as of
// this writing), and the one octet-stream body in the spec (the inbound
// WhatsApp webhook) carries a signature computed over its exact raw bytes,
// which is a correctness risk this package has no reason to take on for a
// "type: string, format: binary" schema that validates almost anything
// anyway. Params on these routes are still validated.
func excludeRequestBody(r *http.Request) bool {
	ct := r.Header.Get("Content-Type")
	if ct == "" {
		return false
	}
	mediaType, _, err := mime.ParseMediaType(ct)
	if err != nil {
		// Malformed header: leave the body untouched and let the normal
		// decode path downstream reject it with its own error.
		return true
	}
	return mediaType != "application/json" && !strings.HasSuffix(mediaType, "+json")
}

// handleViolation always logs the raw violation (never sent to the
// client), then either lets the request through (ModeLog) or rejects it
// with the standard error envelope (ModeEnforce).
func handleViolation(w http.ResponseWriter, r *http.Request, next http.Handler, route *routers.Route, verr error, mode Mode, logger *slog.Logger) {
	logger.LogAttrs(r.Context(), slog.LevelWarn, "openapi_validation_failed",
		slog.String("operation_id", route.Operation.OperationID),
		slog.String("method", r.Method),
		slog.String("path", r.URL.Path),
		slog.String("mode", string(mode)),
		slog.String("request_id", httpx.RequestIDFromContext(r.Context())),
		slog.String("error", verr.Error()),
	)

	if mode != ModeEnforce {
		next.ServeHTTP(w, r)
		return
	}

	httpx.WriteError(w, r, httpx.ErrValidation.WithDetails(violationDetails(verr)...))
}
