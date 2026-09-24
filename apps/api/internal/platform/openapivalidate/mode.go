// Package openapivalidate validates every request's path/query parameters
// and JSON body against the matching operation in the bundled OpenAPI spec
// (openapi/openapi.yaml), the same document internal/platform/authz/spec.go
// loads for x-permission. It never validates responses: a response shape
// bug is caught by contract tests, not by rejecting the client's request.
//
// Docs/08-security.md section 7 calls for validation "in two layers: the
// OpenAPI schema (shape) and the domain (rules)". Before this package,
// only the second layer existed in code; every handler re-derived the first
// layer ad hoc from struct tags and manual checks, so spec and code could
// drift without anything noticing.
package openapivalidate

// Mode controls what a spec-validation failure does, set by the
// OPENAPI_VALIDATION env var (platform/config) and resolved once at
// startup into the middleware built by NewMiddleware.
type Mode string

const (
	// ModeEnforce rejects the request with the standard error envelope
	// (VALIDATION_FAILED, 400) when it does not match the spec. Default in
	// development and test, so spec drift fails fast in CI.
	ModeEnforce Mode = "enforce"
	// ModeLog records the violation (operation, field, code) and lets the
	// request through unchanged. Default in production: a spec that is
	// wrong or behind the deployed code must not itself take the live site
	// down. It exists to surface drift for a fix, not to block traffic.
	ModeLog Mode = "log"
	// ModeOff skips validation entirely; NewMiddleware returns a no-op and
	// never parses the spec into a router.
	ModeOff Mode = "off"
)
