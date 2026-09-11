package service

import (
	"context"
	"encoding/json"
	"strconv"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
)

const (
	policyKindPermits            = "permits"
	policyKindLateArrivalActions = "late_arrival_actions"
)

// permitsPolicyConfig is the JSON shape stored in
// tenant_policies.config for kind "permits": the small set of toggles
// docs/02-system-design.md section 4.3 documents as tenant-configurable
// rather than hardcoded.
type permitsPolicyConfig struct {
	// EvidenceRequired gates leave-request submission and review/issue on
	// an attached evidence document, matching the old app's rule
	// (student_leave_api.go) and docs/02-system-design.md:67. Defaults to
	// true, the old app's only behaviour.
	EvidenceRequired *bool `json:"evidence_required,omitempty"`
}

// evidenceRequired reports whether the tenant currently requires evidence
// on a leave request, seeding tenant_policies(kind='permits') version 1
// with the old app's default (true) the first time a tenant is asked, so
// later reads are a plain select and the setting is auditable from then
// on -- mirrors attendance/service.loadStatusPolicy's pattern.
func (s *Service) evidenceRequired(ctx context.Context, tenantID uuid.UUID) (bool, error) {
	raw, _, found, err := s.repo.GetLatestPolicy(ctx, tenantID, policyKindPermits)
	if err != nil {
		return false, err
	}
	if !found {
		required := true
		encoded, err := json.Marshal(permitsPolicyConfig{EvidenceRequired: &required})
		if err != nil {
			return true, err
		}
		if err := s.repo.CreatePolicy(ctx, tenantID, policyKindPermits, 1, encoded, s.clock.Now(), uuid.NullUUID{}); err != nil {
			return true, err
		}
		return true, nil
	}
	var cfg permitsPolicyConfig
	if err := json.Unmarshal(raw, &cfg); err != nil || cfg.EvidenceRequired == nil {
		return true, nil
	}
	return *cfg.EvidenceRequired, nil
}

// lateArrivalActionsConfig is the JSON shape stored in
// tenant_policies.config for kind "late_arrival_actions": occurrence
// number (as a string, since JSON object keys are always strings) to
// domain.RequiredAction.
type lateArrivalActionsConfig map[string]domain.RequiredAction

// lateArrivalActions returns the tenant's configured occurrence -> action
// table, seeding tenant_policies(kind='late_arrival_actions') version 1
// with domain.DefaultLateArrivalActions the first time a tenant is asked.
// s.cfg.LateArrivalActions (set once at process start) is consulted only
// as a fallback when tenant_policies itself cannot be read, so a caller
// that has not wired tenant_policies for this kind yet still gets a
// sensible default instead of an empty table.
func (s *Service) lateArrivalActions(ctx context.Context, tenantID uuid.UUID) (map[int]domain.RequiredAction, error) {
	raw, _, found, err := s.repo.GetLatestPolicy(ctx, tenantID, policyKindLateArrivalActions)
	if err != nil {
		return s.cfg.LateArrivalActions, err
	}
	if !found {
		def := domain.DefaultLateArrivalActions()
		encoded, err := json.Marshal(toLateArrivalActionsConfig(def))
		if err != nil {
			return def, err
		}
		if err := s.repo.CreatePolicy(ctx, tenantID, policyKindLateArrivalActions, 1, encoded, s.clock.Now(), uuid.NullUUID{}); err != nil {
			return def, err
		}
		return def, nil
	}
	var cfg lateArrivalActionsConfig
	if err := json.Unmarshal(raw, &cfg); err != nil || len(cfg) == 0 {
		return domain.DefaultLateArrivalActions(), nil
	}
	return fromLateArrivalActionsConfig(cfg), nil
}

func toLateArrivalActionsConfig(m map[int]domain.RequiredAction) lateArrivalActionsConfig {
	out := make(lateArrivalActionsConfig, len(m))
	for occurrence, action := range m {
		out[strconv.Itoa(occurrence)] = action
	}
	return out
}

func fromLateArrivalActionsConfig(cfg lateArrivalActionsConfig) map[int]domain.RequiredAction {
	out := make(map[int]domain.RequiredAction, len(cfg))
	for key, action := range cfg {
		if n, err := strconv.Atoi(key); err == nil {
			out[n] = action
		}
	}
	return out
}
