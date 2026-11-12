// flags_operator.go is the operator-tooling path to module feature flags:
// cmd/modules calls these methods straight against the database, with no
// HTTP request and no authenticated user behind them. Unlike ListFlags and
// SetFlag (flags.go), which serve the platform console and stay refused by
// s.guard() in single-tenant mode, nothing here calls s.guard(): every
// current deployment runs TENANCY_MODE=single, where flags are still
// enforced (IsModuleEnabled and the central module gate apply in both
// modes) but the console does not exist, so without this path the only way
// to switch a module off would be raw SQL. These methods must never be
// exposed through an HTTP handler: whoever can run them already holds the
// database credentials.
package service

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/audit"
)

// ErrTenantRequired means several tenants exist and the operator named
// none, so ResolveTenantForOperator will not guess.
var ErrTenantRequired = errors.New("several tenants exist; name one")

// Audit vocabulary for an operator flag change.
const (
	operatorFlagAuditAction = "feature_flag.update"
	operatorFlagAuditEntity = "feature_flag"
)

// OperatorTenantError explains why ResolveTenantForOperator could not pick
// a tenant, carrying every slug it could have picked so the caller can show
// them. Err is domain.ErrTenantNotFound (no tenant at all, or none with the
// requested slug) or ErrTenantRequired.
type OperatorTenantError struct {
	Err       error
	Requested string
	Available []string
}

func (e *OperatorTenantError) Error() string {
	switch {
	case len(e.Available) == 0:
		return "no tenant exists"
	case e.Requested == "":
		return fmt.Sprintf("%s: %s", e.Err, strings.Join(e.Available, ", "))
	default:
		return fmt.Sprintf("tenant %q not found; available: %s", e.Requested, strings.Join(e.Available, ", "))
	}
}

func (e *OperatorTenantError) Unwrap() error { return e.Err }

// OperatorUnknownModulesError lists every name ValidateModuleNames
// rejected. It unwraps to domain.ErrUnknownModule.
type OperatorUnknownModulesError struct {
	Names []string
}

func (e *OperatorUnknownModulesError) Error() string {
	return fmt.Sprintf("unknown module(s): %s", strings.Join(e.Names, ", "))
}

func (e *OperatorUnknownModulesError) Unwrap() error { return domain.ErrUnknownModule }

// OperatorFlagChange reports what SetFlagsForOperator did to one module.
// Before is the effective state it found (opt-out default included);
// Changed is false when the module was already in the requested state, in
// which case nothing was written for it.
type OperatorFlagChange struct {
	Module  string
	Before  bool
	After   bool
	Changed bool
}

// operatorFlagSnapshot is the audit_logs before/after payload of one
// operator flag change.
type operatorFlagSnapshot struct {
	Module  string `json:"module"`
	Enabled bool   `json:"enabled"`
}

// ValidateModuleNames checks every name against domain.AllModules and
// returns them deduplicated in the order given. Any unknown name fails the
// whole list with *OperatorUnknownModulesError, so a caller can reject a
// typo before touching anything.
func ValidateModuleNames(names []string) ([]domain.Module, error) {
	var unknown []string
	seen := make(map[domain.Module]bool, len(names))
	out := make([]domain.Module, 0, len(names))
	for _, name := range names {
		m := domain.Module(name)
		if !m.Valid() {
			unknown = append(unknown, name)
			continue
		}
		if !seen[m] {
			seen[m] = true
			out = append(out, m)
		}
	}
	if len(unknown) > 0 {
		return nil, &OperatorUnknownModulesError{Names: unknown}
	}
	return out, nil
}

// ResolveTenantForOperator finds the tenant an operator command acts on.
// An empty slug is accepted only when exactly one (non-deleted) tenant
// exists -- the single-tenant install -- so a command run on a multi-tenant
// database never silently picks one school. Failures are
// *OperatorTenantError.
func (s *Service) ResolveTenantForOperator(ctx context.Context, slug string) (domain.Tenant, error) {
	tenants, err := s.repo.ListTenants(ctx)
	if err != nil {
		return domain.Tenant{}, err
	}
	slugs := make([]string, len(tenants))
	for i, t := range tenants {
		if slug != "" && t.Slug == slug {
			return t, nil
		}
		slugs[i] = t.Slug
	}
	sort.Strings(slugs)
	switch {
	case len(tenants) == 0:
		return domain.Tenant{}, &OperatorTenantError{Err: domain.ErrTenantNotFound, Requested: slug}
	case slug != "":
		return domain.Tenant{}, &OperatorTenantError{Err: domain.ErrTenantNotFound, Requested: slug, Available: slugs}
	case len(tenants) > 1:
		return domain.Tenant{}, &OperatorTenantError{Err: ErrTenantRequired, Available: slugs}
	}
	return tenants[0], nil
}

// ListFlagsForOperator is ListFlags without the console guard: every module
// in domain.AllModules order, with modules that have no feature_flags row
// reported as enabled (opt-out).
func (s *Service) ListFlagsForOperator(ctx context.Context, tenantID uuid.UUID) ([]domain.ModuleFlag, error) {
	if err := s.requireOperatorTenant(ctx, tenantID); err != nil {
		return nil, err
	}
	stored, err := s.StoredFlags(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	return operatorEffectiveFlags(stored), nil
}

// SetFlagsForOperator turns every named module on or off for one tenant,
// without the console guard. All names are validated before anything is
// written (an unknown one fails the call with
// *OperatorUnknownModulesError and changes nothing), and every write
// happens in one transaction. A module already in the requested state is
// left untouched, so repeating a call is a successful no-op.
//
// Each actual change writes one audit_logs row (action
// "feature_flag.update", entity the tenant, before/after
// {module, enabled}). There is no user behind an operator command, so
// actor_user_id stays NULL; the caller identifies itself the way an HTTP
// request does, through the request metadata on ctx (cmd/modules sets a
// user agent naming the CLI).
func (s *Service) SetFlagsForOperator(ctx context.Context, tenantID uuid.UUID, modules []string, enabled bool) ([]OperatorFlagChange, error) {
	names, err := ValidateModuleNames(modules)
	if err != nil {
		return nil, err
	}
	if err := s.requireOperatorTenant(ctx, tenantID); err != nil {
		return nil, err
	}

	var changes []OperatorFlagChange
	changed := false
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		rows, err := s.repo.ListFeatureFlags(ctx, tenantID)
		if err != nil {
			return err
		}
		stored := make(map[string]bool, len(rows))
		for _, f := range rows {
			stored[f.Module] = f.Enabled
		}
		for _, m := range names {
			before, ok := stored[string(m)]
			if !ok {
				before = true // opt-out: a module without a row runs
			}
			change := OperatorFlagChange{Module: string(m), Before: before, After: enabled, Changed: before != enabled}
			if change.Changed {
				if err := s.applyOperatorFlag(ctx, tenantID, m, before, enabled); err != nil {
					return err
				}
				changed = true
			}
			changes = append(changes, change)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	if changed && s.onFlagChanged != nil {
		s.onFlagChanged(tenantID)
	}
	return changes, nil
}

// applyOperatorFlag writes one module's new state and its audit row inside
// the transaction SetFlagsForOperator opened.
func (s *Service) applyOperatorFlag(ctx context.Context, tenantID uuid.UUID, m domain.Module, before, after bool) error {
	if _, err := s.repo.SetFeatureFlag(ctx, tenantID, m, after); err != nil {
		return err
	}
	return audit.Record(ctx, tenantID, operatorFlagAuditAction, operatorFlagAuditEntity, tenantID,
		operatorFlagSnapshot{Module: string(m), Enabled: before},
		operatorFlagSnapshot{Module: string(m), Enabled: after})
}

func (s *Service) requireOperatorTenant(ctx context.Context, tenantID uuid.UUID) error {
	_, ok, err := s.repo.GetTenant(ctx, tenantID)
	if err != nil {
		return err
	}
	if !ok {
		return domain.ErrTenantNotFound
	}
	return nil
}

// operatorEffectiveFlags expands a tenant's explicit rows (module ->
// enabled) to every module in domain.AllModules order, defaulting a
// missing row to enabled.
func operatorEffectiveFlags(stored map[string]bool) []domain.ModuleFlag {
	out := make([]domain.ModuleFlag, len(domain.AllModules))
	for i, m := range domain.AllModules {
		enabled, ok := stored[string(m)]
		if !ok {
			enabled = true
		}
		out[i] = domain.ModuleFlag{Module: string(m), Enabled: enabled}
	}
	return out
}
