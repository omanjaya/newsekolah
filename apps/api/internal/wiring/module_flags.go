package wiring

import (
	"context"

	"github.com/google/uuid"

	platformdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
)

// ModuleFlagReader answers whether a feature module is on for a tenant. The
// platform service, PlatformFlags and the cached reader (CachedFlags) all
// have this shape, so any of them can back the adapters below.
type ModuleFlagReader interface {
	IsModuleEnabled(ctx context.Context, tenantID uuid.UUID, module string) (bool, error)
}

// LateBoundFlags lets an adapter built before the platform module hold a
// flag reader that is only bound once the platform module exists, the same
// construction-order workaround cmd/api already uses for grading's flags.
// Until Bind is called every module reads as enabled (feature_flags is
// opt-out), which only matters before the process serves anything.
type LateBoundFlags struct{ inner ModuleFlagReader }

// Bind attaches the real reader. Call it during wiring, before requests or
// jobs run.
func (l *LateBoundFlags) Bind(reader ModuleFlagReader) { l.inner = reader }

func (l *LateBoundFlags) IsModuleEnabled(ctx context.Context, tenantID uuid.UUID, module string) (bool, error) {
	if l == nil || l.inner == nil {
		return true, nil
	}
	return l.inner.IsModuleEnabled(ctx, tenantID, module)
}

// ModuleFlag fixes the module of a ModuleFlagReader, giving the
// single-module FlagReader shape a module's own service declares
// (IsModuleEnabled(ctx, tenantID)). A nil Flags reads as enabled.
type ModuleFlag struct {
	Flags  ModuleFlagReader
	Module platformdomain.Module
}

func (f ModuleFlag) IsModuleEnabled(ctx context.Context, tenantID uuid.UUID) (bool, error) {
	return moduleEnabled(ctx, f.Flags, tenantID, f.Module)
}

// PublicFacingModules are the toggleable modules with pages an anonymous
// visitor can open: library's OPAC. Document verification is ungated
// (tag documents) and the monitor belongs to always-on attendance.
var PublicFacingModules = []platformdomain.Module{platformdomain.ModuleLibrary}

// PublicModules serves the public branding view's disabled_public_modules:
// the switched-off modules among PublicFacingModules, in that order. It is
// deliberately not the full disabled list, which only signed-in users get
// (Me.disabled_modules); an anonymous caller learns nothing here the public
// endpoints would not already answer with 403 MODULE_DISABLED.
type PublicModules struct{ Flags ModuleFlagReader }

func (p PublicModules) DisabledPublicModules(ctx context.Context, tenantID uuid.UUID) ([]string, error) {
	disabled := []string{}
	for _, module := range PublicFacingModules {
		on, err := moduleEnabled(ctx, p.Flags, tenantID, module)
		if err != nil {
			return nil, err
		}
		if !on {
			disabled = append(disabled, string(module))
		}
	}
	return disabled, nil
}

// moduleEnabled is the nil-safe lookup every cross-module adapter in this
// package uses before calling into a toggleable module: a missing reader
// means no flag wiring, which leaves the module on.
func moduleEnabled(ctx context.Context, flags ModuleFlagReader, tenantID uuid.UUID, module platformdomain.Module) (bool, error) {
	if flags == nil {
		return true, nil
	}
	return flags.IsModuleEnabled(ctx, tenantID, string(module))
}
