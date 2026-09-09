package service

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
)

const policyKindAttendanceStatuses = "attendance_statuses"

// policyConfig is the JSON shape stored in tenant_policies.config for kind
// "attendance_statuses": a plain array of domain.StatusDef, one entry per
// status code the tenant accepts.
type policyConfig struct {
	Statuses []domain.StatusDef `json:"statuses"`
}

// loadStatusPolicy returns the tenant's configured attendance status
// policy, seeding domain.DefaultStatusPolicy as tenant_policies version 1
// the first time a tenant is asked (so every later read is a plain
// select, and the policy is auditable from then on).
func (s *Service) loadStatusPolicy(ctx context.Context, tenantID uuid.UUID) (domain.StatusPolicy, error) {
	raw, version, found, err := s.repo.GetLatestPolicy(ctx, tenantID, policyKindAttendanceStatuses)
	if err != nil {
		return domain.StatusPolicy{}, err
	}
	if !found {
		def := domain.DefaultStatusPolicy()
		encoded, err := json.Marshal(policyConfig{Statuses: def.Statuses})
		if err != nil {
			return domain.StatusPolicy{}, err
		}
		if err := s.repo.CreatePolicy(ctx, tenantID, policyKindAttendanceStatuses, def.Version, encoded, s.clock.Now(), uuid.NullUUID{}); err != nil {
			return domain.StatusPolicy{}, err
		}
		return def, nil
	}

	var cfg policyConfig
	if err := json.Unmarshal(raw, &cfg); err != nil || len(cfg.Statuses) == 0 {
		return domain.DefaultStatusPolicy(), nil
	}
	return domain.StatusPolicy{Version: version, Statuses: cfg.Statuses}, nil
}

// defaultStatusCode is what a not-yet-recorded entry defaults to in a
// session payload: the lowest-priority (least attention-worthy) status
// that counts as present, i.e. "assume attending until marked otherwise" --
// the same assumption the old system made implicitly. Falls back to the
// policy's first status, or "" if the tenant's policy is empty.
func defaultStatusCode(policy domain.StatusPolicy) string {
	best := ""
	bestPriority := int(^uint(0) >> 1)
	for _, st := range policy.Statuses {
		if !st.CountsAsPresent {
			continue
		}
		if best == "" || st.Priority > bestPriority {
			best, bestPriority = st.Code, st.Priority
		}
	}
	if best != "" {
		return best
	}
	if len(policy.Statuses) > 0 {
		return policy.Statuses[0].Code
	}
	return ""
}
