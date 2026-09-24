package openapivalidate

import (
	"errors"
	"testing"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/getkin/kin-openapi/openapi3filter"
)

func TestSchemaFieldCode(t *testing.T) {
	cases := map[string]string{
		"required":              "REQUIRED",
		"type":                  "INVALID_TYPE",
		"minLength":             "TOO_SHORT",
		"maxLength":             "TOO_LONG",
		"minimum":               "OUT_OF_RANGE",
		"maximum":               "OUT_OF_RANGE",
		"pattern":               "INVALID_FORMAT",
		"format":                "INVALID_FORMAT",
		"uniqueItems":           "DUPLICATE",
		"additionalProperties":  "UNKNOWN_FIELD",
		"somethingUnrecognized": "INVALID",
	}
	for field, want := range cases {
		if got := schemaFieldCode(field); got != want {
			t.Errorf("schemaFieldCode(%q) = %q, want %q", field, got, want)
		}
	}
}

func TestParseErrorCode(t *testing.T) {
	if got := parseErrorCode(openapi3filter.KindInvalidFormat); got != "INVALID_FORMAT" {
		t.Errorf("KindInvalidFormat: got %q", got)
	}
	if got := parseErrorCode(openapi3filter.KindUnsupportedFormat); got != "INVALID_FORMAT" {
		t.Errorf("KindUnsupportedFormat: got %q", got)
	}
	if got := parseErrorCode(openapi3filter.KindOther); got != "INVALID" {
		t.Errorf("KindOther: got %q", got)
	}
}

func TestJoinField(t *testing.T) {
	cases := []struct {
		base    string
		pointer []string
		want    string
	}{
		{"body", nil, "body"},
		{"body", []string{"username"}, "body.username"},
		{"body", []string{"items", "0", "name"}, "body.items.0.name"},
		{"", []string{"username"}, "username"},
	}
	for _, c := range cases {
		if got := joinField(c.base, c.pointer); got != c.want {
			t.Errorf("joinField(%q, %v) = %q, want %q", c.base, c.pointer, got, c.want)
		}
	}
}

func TestDetailFor_SentinelErrors(t *testing.T) {
	required := &openapi3filter.RequestError{
		Parameter: &openapi3.Parameter{Name: "limit", In: "query"},
		Err:       openapi3filter.ErrInvalidRequired,
	}
	if d := detailFor(required); d.Field != "limit" || d.Code != "REQUIRED" {
		t.Errorf("required: got %+v", d)
	}

	empty := &openapi3filter.RequestError{
		Parameter: &openapi3.Parameter{Name: "limit", In: "query"},
		Err:       openapi3filter.ErrInvalidEmptyValue,
	}
	if d := detailFor(empty); d.Field != "limit" || d.Code != "EMPTY" {
		t.Errorf("empty: got %+v", d)
	}
}

func TestDetailFor_NonRequestErrorFallsBackToGenericInvalid(t *testing.T) {
	d := detailFor(errors.New("some unrelated failure"))
	if d.Code != "INVALID" {
		t.Errorf("expected the generic INVALID fallback, got %+v", d)
	}
}

func TestFlatten_NilIsEmpty(t *testing.T) {
	if got := flatten(nil); got != nil {
		t.Errorf("flatten(nil) = %v, want nil", got)
	}
}

func TestFlatten_UnwrapsNestedMultiErrorInsideRequestError(t *testing.T) {
	base := &openapi3filter.RequestError{RequestBody: &openapi3.RequestBody{}}
	inner := openapi3.MultiError{
		&openapi3.SchemaError{SchemaField: "required"},
		&openapi3.SchemaError{SchemaField: "type"},
	}
	base.Err = inner

	leaves := flatten(base)
	if len(leaves) != 2 {
		t.Fatalf("expected 2 leaves, got %d: %+v", len(leaves), leaves)
	}
	for _, leaf := range leaves {
		reqErr, ok := leaf.(*openapi3filter.RequestError)
		if !ok {
			t.Fatalf("expected each leaf to stay a *RequestError, got %T", leaf)
		}
		if reqErr.RequestBody == nil {
			t.Error("expected the field context (RequestBody) to be preserved on the rewrapped leaf")
		}
	}
}
