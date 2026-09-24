package openapivalidate

import (
	"errors"
	"strings"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/getkin/kin-openapi/openapi3filter"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

// violationDetails converts a kin-openapi validation error into field-level
// details for the client. It never forwards the library's own error text
// (verbose, and occasionally echoes part of the submitted value) -- callers
// get a field path and a stable code; the raw error goes to the server log
// line in handleViolation instead.
func violationDetails(err error) []httpx.ErrorDetail {
	leaves := flatten(err)
	details := make([]httpx.ErrorDetail, 0, len(leaves))
	for _, leaf := range leaves {
		details = append(details, detailFor(leaf))
	}
	if len(details) == 0 {
		// Something that did not decompose into a RequestError at all (a
		// bare RouteError, for instance) -- still a validation failure,
		// just without a field-level breakdown.
		details = append(details, httpx.ErrorDetail{Code: "INVALID"})
	}
	return details
}

// flatten walks the error tree ValidateRequest can return down to
// individual leaves, almost always *openapi3filter.RequestError. Two
// containers nest errors here: openapi3.MultiError at the top (one entry
// per failed parameter/body, from Options.MultiError) and, one level
// deeper, a *RequestError whose own Err is itself an openapi3.MultiError
// (a request body with several schema violations at once). Both need
// unwrapping so the client gets one detail per actual problem.
func flatten(err error) []error {
	if err == nil {
		return nil
	}
	if me, ok := err.(openapi3.MultiError); ok {
		out := make([]error, 0, len(me))
		for _, sub := range me {
			out = append(out, flatten(sub)...)
		}
		return out
	}
	if reqErr, ok := err.(*openapi3filter.RequestError); ok {
		if inner, ok := reqErr.Err.(openapi3.MultiError); ok {
			out := make([]error, 0, len(inner))
			for _, cause := range flatten(inner) {
				out = append(out, rewrap(reqErr, cause))
			}
			return out
		}
	}
	return []error{err}
}

// rewrap keeps a RequestError's field context (which parameter, or the
// request body) while swapping in one leaf cause unwrapped from its
// original, multi-cause Err.
func rewrap(base *openapi3filter.RequestError, cause error) *openapi3filter.RequestError {
	return &openapi3filter.RequestError{
		Input:       base.Input,
		Parameter:   base.Parameter,
		RequestBody: base.RequestBody,
		Reason:      base.Reason,
		Err:         cause,
	}
}

// detailFor maps one leaf error to a field path and a stable code.
func detailFor(err error) httpx.ErrorDetail {
	reqErr, ok := err.(*openapi3filter.RequestError)
	if !ok {
		return httpx.ErrorDetail{Code: "INVALID"}
	}
	field := fieldBase(reqErr)

	switch cause := reqErr.Err.(type) {
	case *openapi3.SchemaError:
		return httpx.ErrorDetail{Field: joinField(field, cause.JSONPointer()), Code: schemaFieldCode(cause.SchemaField)}
	case *openapi3filter.ParseError:
		return httpx.ErrorDetail{Field: field, Code: parseErrorCode(cause.Kind)}
	}

	switch {
	case errors.Is(reqErr.Err, openapi3filter.ErrInvalidRequired):
		return httpx.ErrorDetail{Field: field, Code: "REQUIRED"}
	case errors.Is(reqErr.Err, openapi3filter.ErrInvalidEmptyValue):
		return httpx.ErrorDetail{Field: field, Code: "EMPTY"}
	}
	return httpx.ErrorDetail{Field: field, Code: "INVALID"}
}

// fieldBase names the top-level field a RequestError is about: the
// parameter name, or "body" for a request body error. Empty when neither
// is set (the "request body not allowed for this request" case).
func fieldBase(reqErr *openapi3filter.RequestError) string {
	switch {
	case reqErr.Parameter != nil:
		return reqErr.Parameter.Name
	case reqErr.RequestBody != nil:
		return "body"
	default:
		return ""
	}
}

// joinField appends a JSON-schema pointer path (["items", "0", "name"]) to
// a base field name, dot-joined to match the flat "field.subfield" style
// every other handler in this codebase already uses for ErrorDetail.Field.
func joinField(base string, pointer []string) string {
	if len(pointer) == 0 {
		return base
	}
	path := strings.Join(pointer, ".")
	if base == "" {
		return path
	}
	return base + "." + path
}

// schemaFieldCode maps a JSON Schema keyword (openapi3.SchemaError.SchemaField)
// to the stable UPPER_SNAKE_CASE code convention used across httpx.ErrorDetail
// everywhere else in this codebase.
func schemaFieldCode(field string) string {
	switch field {
	case "required":
		return "REQUIRED"
	case "type":
		return "INVALID_TYPE"
	case "minLength":
		return "TOO_SHORT"
	case "maxLength":
		return "TOO_LONG"
	case "minimum", "exclusiveMinimum", "maximum", "exclusiveMaximum":
		return "OUT_OF_RANGE"
	case "minItems", "maxItems", "minProperties", "maxProperties":
		return "OUT_OF_RANGE"
	case "pattern", "format":
		return "INVALID_FORMAT"
	case "uniqueItems":
		return "DUPLICATE"
	case "additionalProperties":
		return "UNKNOWN_FIELD"
	default:
		return "INVALID"
	}
}

// parseErrorCode maps a ParseError.Kind (a parameter or body value that
// could not even be decoded into the type its schema declares) to the same
// code convention.
func parseErrorCode(kind openapi3filter.ParseErrorKind) string {
	switch kind {
	case openapi3filter.KindInvalidFormat, openapi3filter.KindUnsupportedFormat:
		return "INVALID_FORMAT"
	default:
		return "INVALID"
	}
}
