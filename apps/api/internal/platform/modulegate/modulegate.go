// Package modulegate refuses HTTP operations that belong to a feature-flagged
// module when that module is disabled for the calling tenant. It is the
// single central enforcement point: the operation -> module mapping is read
// from the OpenAPI operation tags, so a new endpoint is gated just by
// carrying its module's tag. Module-level service gates stay in place for
// background jobs and cross-module calls.
package modulegate

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

// FlagReader answers whether a module is enabled for a tenant. The wiring
// layer adapts the platform module's feature flags to it, so this package
// depends on no module.
type FlagReader interface {
	IsModuleEnabled(ctx context.Context, tenantID uuid.UUID, module string) (bool, error)
}

// OperationModules maps an OpenAPI operationId to the flag module it
// belongs to. Operations outside every gated module are absent.
type OperationModules struct {
	byOperation map[string]string
}

// Module returns the gated module an operation belongs to.
func (m OperationModules) Module(operationID string) (string, bool) {
	module, ok := m.byOperation[operationID]
	return module, ok
}

// Count returns how many operations each gated module owns.
func (m OperationModules) Count() map[string]int {
	counts := map[string]int{}
	for _, module := range m.byOperation {
		counts[module]++
	}
	return counts
}

// normalizeTag turns an OpenAPI tag into a module name: tags are
// kebab-case ("staff-attendance") while flag modules are snake_case
// ("staff_attendance").
func normalizeTag(tag string) string {
	return strings.ReplaceAll(tag, "-", "_")
}

// LoadOperationModules walks every operation in doc and maps it to a gated
// module through its tags. gatedModules is the list of toggleable module
// names (supplied by wiring so it cannot drift from the platform module's
// own list). An operation tagged with two different gated modules is
// ambiguous and fails startup.
func LoadOperationModules(doc *openapi3.T, gatedModules []string) (OperationModules, error) {
	gated := make(map[string]bool, len(gatedModules))
	for _, module := range gatedModules {
		gated[module] = true
	}

	result := OperationModules{byOperation: map[string]string{}}
	for path, item := range doc.Paths.Map() {
		for method, op := range item.Operations() {
			found := map[string]bool{}
			for _, tag := range op.Tags {
				if module := normalizeTag(tag); gated[module] {
					found[module] = true
				}
			}
			if len(found) == 0 {
				continue
			}
			modules := make([]string, 0, len(found))
			for module := range found {
				modules = append(modules, module)
			}
			sort.Strings(modules)
			if len(modules) > 1 {
				return OperationModules{}, fmt.Errorf(
					"modulegate: operation %q (%s %s) belongs to several gated modules: %v", op.OperationID, method, path, modules,
				)
			}
			result.byOperation[op.OperationID] = modules[0]
		}
	}
	return result, nil
}

// Check returns httpx.ErrModuleDisabled when the operation belongs to a
// gated module that is disabled for the tenant in ctx. It passes through
// when the operation is ungated or the request carries no tenant (platform
// console routes, health). A flag lookup failure fails closed as an
// internal error rather than serving a possibly disabled module.
func Check(ctx context.Context, ops OperationModules, flags FlagReader, operationID string) error {
	module, gated := ops.Module(operationID)
	if !gated {
		return nil
	}
	tenantID, ok := httpx.TenantIDFromContext(ctx)
	if !ok {
		return nil
	}
	enabled, err := flags.IsModuleEnabled(ctx, tenantID, module)
	if err != nil {
		return httpx.Internal(err)
	}
	if !enabled {
		return httpx.ErrModuleDisabled.WithDetails(httpx.ErrorDetail{Field: "module", Code: module})
	}
	return nil
}
