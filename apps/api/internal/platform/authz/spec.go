package authz

import (
	"encoding/json"
	"fmt"
	"slices"

	"github.com/getkin/kin-openapi/openapi3"
)

// permAuthenticated is the x-permission value meaning "any valid session".
const permAuthenticated = "authenticated"

// OperationPermissions maps an OpenAPI operationId to the permission codes
// that may call it. An operation declares either one code
// (`x-permission: view_supervision`) or a list of alternatives, any one of
// which is enough (`x-permission: [view_supervision, view_own_supervision]`;
// the service then scopes the narrower one to the caller's own records).
// "authenticated" means any valid session and is only valid on its own;
// publicOps lists operations explicitly marked x-public: true (no auth
// required).
type OperationPermissions struct {
	byOperation map[string][]string
	publicOps   map[string]bool
}

// Permissions returns the codes that may call operationID; holding any one
// of them is enough.
func (p OperationPermissions) Permissions(operationID string) ([]string, bool) {
	perms, ok := p.byOperation[operationID]
	return perms, ok
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
		byOperation: map[string][]string{},
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

			perms, ok := permissionExtension(op.Extensions)
			if !ok {
				return OperationPermissions{}, fmt.Errorf(
					"authz: operation %q (%s %s) has neither x-permission nor x-public: true", op.OperationID, method, path,
				)
			}
			if len(perms) > 1 && slices.Contains(perms, permAuthenticated) {
				return OperationPermissions{}, fmt.Errorf(
					"authz: operation %q (%s %s) lists %q among alternatives; it is only valid on its own",
					op.OperationID, method, path, permAuthenticated,
				)
			}
			result.byOperation[op.OperationID] = perms
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

// permissionExtension reads x-permission as either one code or a non-empty
// list of codes. An empty or non-string entry makes the whole declaration
// invalid, so a typo fails startup instead of silently changing who may
// call the operation.
func permissionExtension(extensions map[string]any) ([]string, bool) {
	if perm, ok := stringExtension(extensions, "x-permission"); ok {
		if perm == "" {
			return nil, false
		}
		return []string{perm}, true
	}
	var perms []string
	switch v := extensions["x-permission"].(type) {
	case []any:
		for _, item := range v {
			code, ok := item.(string)
			if !ok {
				return nil, false
			}
			perms = append(perms, code)
		}
	case []string:
		perms = v
	case json.RawMessage:
		if err := json.Unmarshal(v, &perms); err != nil {
			return nil, false
		}
	default:
		return nil, false
	}
	if len(perms) == 0 || slices.Contains(perms, "") {
		return nil, false
	}
	return perms, true
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
