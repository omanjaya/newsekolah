package authz

import (
	"encoding/json"
	"fmt"

	"github.com/getkin/kin-openapi/openapi3"
)

// OperationPermissions maps an OpenAPI operationId to the permission code
// required to call it. "authenticated" means any valid session; publicOps
// lists operations explicitly marked x-public: true (no auth required).
type OperationPermissions struct {
	byOperation map[string]string
	publicOps   map[string]bool
}

func (p OperationPermissions) Permission(operationID string) (string, bool) {
	perm, ok := p.byOperation[operationID]
	return perm, ok
}

func (p OperationPermissions) IsPublic(operationID string) bool {
	return p.publicOps[operationID]
}

// LoadOperationPermissions walks every operation in doc and reads its
// x-permission (or x-public: true) extension. It fails startup rather than
// letting an endpoint silently run without an authorization check: per
// docs/08-security.md section 3, every operation must declare one or the
// other.
func LoadOperationPermissions(doc *openapi3.T) (OperationPermissions, error) {
	result := OperationPermissions{
		byOperation: map[string]string{},
		publicOps:   map[string]bool{},
	}

	for path, item := range doc.Paths.Map() {
		for method, op := range item.Operations() {
			if op.OperationID == "" {
				return OperationPermissions{}, fmt.Errorf("authz: %s %s has no operationId", method, path)
			}

			if isPublic(op.Extensions) {
				result.publicOps[op.OperationID] = true
				continue
			}

			perm, ok := stringExtension(op.Extensions, "x-permission")
			if !ok || perm == "" {
				return OperationPermissions{}, fmt.Errorf(
					"authz: operation %q (%s %s) has neither x-permission nor x-public: true", op.OperationID, method, path,
				)
			}
			result.byOperation[op.OperationID] = perm
		}
	}

	return result, nil
}

func isPublic(extensions map[string]any) bool {
	raw, ok := extensions["x-public"]
	if !ok {
		return false
	}
	switch v := raw.(type) {
	case bool:
		return v
	case json.RawMessage:
		var b bool
		_ = json.Unmarshal(v, &b)
		return b
	default:
		return false
	}
}

func stringExtension(extensions map[string]any, key string) (string, bool) {
	raw, ok := extensions[key]
	if !ok {
		return "", false
	}
	switch v := raw.(type) {
	case string:
		return v, true
	case json.RawMessage:
		var s string
		if err := json.Unmarshal(v, &s); err != nil {
			return "", false
		}
		return s, true
	default:
		return "", false
	}
}
