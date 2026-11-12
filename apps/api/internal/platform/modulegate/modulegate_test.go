package modulegate_test

import (
	"context"
	"errors"
	"net/http"
	"testing"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	platformdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/modulegate"
)

func op(id string, tags ...string) *openapi3.Operation {
	return &openapi3.Operation{OperationID: id, Tags: tags}
}

func docWith(ops map[string]*openapi3.Operation) *openapi3.T {
	paths := openapi3.NewPaths()
	for path, o := range ops {
		paths.Set(path, &openapi3.PathItem{Get: o})
	}
	return &openapi3.T{Paths: paths}
}

func TestLoadOperationModulesMapsTagsToModules(t *testing.T) {
	doc := docWith(map[string]*openapi3.Operation{
		"/a": op("listBooks", "library"),
		"/b": op("listScans", "staff-attendance"),
		"/c": op("listClasses", "academic"),
		"/d": op("noTags"),
	})

	ops, err := modulegate.LoadOperationModules(doc, []string{"library", "staff_attendance"})
	require.NoError(t, err)

	module, ok := ops.Module("listBooks")
	require.True(t, ok)
	require.Equal(t, "library", module)

	module, ok = ops.Module("listScans")
	require.True(t, ok, "tag staff-attendance must map to flag module staff_attendance")
	require.Equal(t, "staff_attendance", module)

	for _, ungated := range []string{"listClasses", "noTags", "missing"} {
		_, ok = ops.Module(ungated)
		require.False(t, ok, ungated)
	}
}

func TestLoadOperationModulesRejectsAmbiguousOperation(t *testing.T) {
	doc := docWith(map[string]*openapi3.Operation{"/a": op("both", "library", "billing")})
	_, err := modulegate.LoadOperationModules(doc, []string{"library", "billing"})
	require.Error(t, err)
}

func TestLoadOperationModulesIgnoresTagsOutsideGatedList(t *testing.T) {
	doc := docWith(map[string]*openapi3.Operation{"/a": op("listBooks", "library")})
	ops, err := modulegate.LoadOperationModules(doc, []string{"billing"})
	require.NoError(t, err)
	_, ok := ops.Module("listBooks")
	require.False(t, ok)
}

// TestEveryToggleableModuleOwnsOperations fails when a module in
// platform/domain.AllModules has no operation tagged for it in the real
// spec, which would mean the central gate silently protects nothing for it.
func TestEveryToggleableModuleOwnsOperations(t *testing.T) {
	doc, err := api.GetSpec()
	require.NoError(t, err)

	names := make([]string, len(platformdomain.AllModules))
	for i, m := range platformdomain.AllModules {
		names[i] = string(m)
	}
	ops, err := modulegate.LoadOperationModules(doc, names)
	require.NoError(t, err)

	counts := ops.Count()
	for _, name := range names {
		require.Positive(t, counts[name], "module %q has no operations tagged for it in the OpenAPI spec", name)
	}
}

type stubFlags struct {
	enabled bool
	err     error
	calls   int
}

func (s *stubFlags) IsModuleEnabled(context.Context, uuid.UUID, string) (bool, error) {
	s.calls++
	return s.enabled, s.err
}

func TestCheck(t *testing.T) {
	doc := docWith(map[string]*openapi3.Operation{"/a": op("listBooks", "library"), "/b": op("listClasses", "academic")})
	ops, err := modulegate.LoadOperationModules(doc, []string{"library"})
	require.NoError(t, err)
	tenantCtx := httpx.WithTenantID(context.Background(), uuid.New())

	t.Run("disabled module is refused with the shared error", func(t *testing.T) {
		err := modulegate.Check(tenantCtx, ops, &stubFlags{enabled: false}, "listBooks")
		var httpErr *httpx.Error
		require.True(t, errors.As(err, &httpErr))
		require.Equal(t, http.StatusForbidden, httpErr.Status)
		require.Equal(t, "MODULE_DISABLED", httpErr.Code)
		require.Equal(t, "library", httpErr.Details[0].Code)
	})
	t.Run("enabled module passes", func(t *testing.T) {
		require.NoError(t, modulegate.Check(tenantCtx, ops, &stubFlags{enabled: true}, "listBooks"))
	})
	t.Run("ungated operation never reads flags", func(t *testing.T) {
		flags := &stubFlags{enabled: false}
		require.NoError(t, modulegate.Check(tenantCtx, ops, flags, "listClasses"))
		require.Zero(t, flags.calls)
	})
	t.Run("no tenant in context passes through", func(t *testing.T) {
		flags := &stubFlags{enabled: false}
		require.NoError(t, modulegate.Check(context.Background(), ops, flags, "listBooks"))
		require.Zero(t, flags.calls)
	})
	t.Run("flag lookup failure fails closed", func(t *testing.T) {
		err := modulegate.Check(tenantCtx, ops, &stubFlags{err: errors.New("db down")}, "listBooks")
		var httpErr *httpx.Error
		require.True(t, errors.As(err, &httpErr))
		require.Equal(t, http.StatusInternalServerError, httpErr.Status)
	})
}
