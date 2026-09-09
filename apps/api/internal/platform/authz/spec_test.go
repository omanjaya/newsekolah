package authz

import (
	"strings"
	"testing"

	"github.com/getkin/kin-openapi/openapi3"
)

func loadDoc(t *testing.T, spec string) *openapi3.T {
	t.Helper()
	doc, err := openapi3.NewLoader().LoadFromData([]byte(spec))
	if err != nil {
		t.Fatalf("load spec: %v", err)
	}
	return doc
}

const specHeader = `
openapi: 3.1.0
info: { title: test, version: "1" }
paths:
`

func TestLoadOperationPermissions_PublicAndPermissioned(t *testing.T) {
	doc := loadDoc(t, specHeader+`
  /public:
    get:
      operationId: getPublic
      x-public: true
      responses: { "200": { description: ok } }
  /protected:
    get:
      operationId: getProtected
      x-permission: view_dashboard
      responses: { "200": { description: ok } }
`)

	ops, err := LoadOperationPermissions(doc)
	if err != nil {
		t.Fatalf("LoadOperationPermissions: %v", err)
	}

	if !ops.IsPublic("getPublic") {
		t.Error("expected getPublic to be public")
	}
	perm, ok := ops.Permission("getProtected")
	if !ok || perm != "view_dashboard" {
		t.Errorf("expected getProtected to require view_dashboard, got %q (found=%v)", perm, ok)
	}
}

// This is the guard the task calls out explicitly: startup must fail
// rather than silently letting an endpoint run without any authorization
// check (docs/08-security.md section 3).
func TestLoadOperationPermissions_FailsWithoutDeclaration(t *testing.T) {
	doc := loadDoc(t, specHeader+`
  /oops:
    get:
      operationId: getOops
      responses: { "200": { description: ok } }
`)

	_, err := LoadOperationPermissions(doc)
	if err == nil {
		t.Fatal("expected an error for an operation with neither x-permission nor x-public")
	}
	if !strings.Contains(err.Error(), "getOops") {
		t.Errorf("expected error to name the offending operation, got: %v", err)
	}
}

func TestLoadOperationPermissions_FailsWithoutOperationID(t *testing.T) {
	doc := loadDoc(t, specHeader+`
  /oops:
    get:
      x-public: true
      responses: { "200": { description: ok } }
`)

	if _, err := LoadOperationPermissions(doc); err == nil {
		t.Fatal("expected an error for an operation with no operationId")
	}
}
