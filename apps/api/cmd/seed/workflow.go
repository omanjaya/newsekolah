package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// exitPermitStages is the exit-permit chain this demo tenant runs, one
// duty-scoped stage short of domain.DefaultStages(domain.KindExitPermit):
// it drops "class_teacher" (approver_rule "teacher_of_class_now"), the one
// stage no duty holder and no review screen exists for (docs/analysis/
// realtime-plan-2026-09-25.md section 4.4's note on `dutySlugForStage`
// having no group topic for it, and section 5's exit-permit queue query
// -- apps/api/internal/modules/permits/queries/exit_permits.sql's
// ListExitPermitsForApproval -- never lists it either). Keeping it would
// make the chain's second stage satisfiable only by whichever teacher is
// scheduled into the student's class at the literal minute a reviewer
// acts, which the multi-actor "school day" simulation
// (apps/web/e2e/simulation) cannot depend on. Every remaining stage keeps
// its original Key, Label and ApproverRule from domain.DefaultStages, so
// this is a trim, not a redesign, and every duty this demo tenant already
// seeds (picket, counselor, leadership, security) still does exactly the
// job its name implies.
var exitPermitStages = []domain.Stage{
	{Key: "duty_teacher", Label: "Guru piket", ApproverRule: "any_teacher", Verification: domain.VerificationQRScan},
	{Key: "counselor", Label: "Guru BK", ApproverRule: "duty:counselor", Verification: domain.VerificationQRScan, DistinctFrom: []string{"duty_teacher"}},
	{Key: "leadership", Label: "Pimpinan", ApproverRule: "duty:leadership", Verification: domain.VerificationQRScan, DistinctFrom: []string{"duty_teacher", "counselor"}},
}

// seedWorkflowDefinitions ensures every workflow kind the permits module
// runs (leave request, late arrival, exit permit) has an active
// definition, and that the exit-permit one is this demo tenant's trimmed
// exitPermitStages rather than the product-wide default -- see that var's
// doc comment. Idempotent: it only replaces the exit-permit definition
// when its current stage keys do not already match, so re-running seed
// never grows the version number forever.
func seedWorkflowDefinitions(ctx context.Context, pool *pgxpool.Pool, tenantID uuid.UUID, actorUserID uuid.UUID, logger *slog.Logger) error {
	schoolModule := school.Register(pool, tenant.ModeSingle, nil)
	permitsModule := permits.Register(permits.Dependencies{Pool: pool, Years: schoolModule.Service})
	svc := permitsModule.Service

	if err := svc.EnsureDefaultDefinitions(ctx, tenantID); err != nil {
		return fmt.Errorf("ensure default workflow definitions: %w", err)
	}

	if err := seedPermitsPolicy(ctx, pool, tenantID, actorUserID); err != nil {
		return fmt.Errorf("seed permits policy: %w", err)
	}

	defs, err := svc.ListDefinitions(ctx, tenantID)
	if err != nil {
		return fmt.Errorf("list workflow definitions: %w", err)
	}
	var active domain.Definition
	found := false
	for _, d := range defs {
		if d.Kind == domain.KindExitPermit && d.IsActive {
			active, found = d, true
			break
		}
	}
	if found && sameStageKeys(active.Stages, exitPermitStages) {
		return nil
	}
	if _, err := svc.ReplaceDefinition(ctx, tenantID, domain.KindExitPermit, exitPermitStages, map[string]any{}, actorUserID); err != nil {
		return fmt.Errorf("replace exit permit definition: %w", err)
	}
	logger.Info("exit permit workflow trimmed to duty-scoped stages", "stages", len(exitPermitStages))
	return nil
}

// permitsPolicyKind mirrors permits/service/policy.go's unexported
// policyKindPermits -- cmd/seed has no service-level setter for this
// tenant policy, so it writes the tenant_policies row directly through the
// generated queries, same shape the service itself reads
// (evidenceRequired's permitsPolicyConfig).
const permitsPolicyKind = "permits"

// seedPermitsPolicy turns off the "leave request needs an attached
// evidence document before it can be approved or issued" tenant policy
// (defaults to true, matching the old app -- permits/service/policy.go's
// evidenceRequired), so the multi-actor simulation's leave-request
// scenario (apps/web/e2e/simulation) can approve a request without also
// driving a file upload through the browser. This is ordinary
// admin-configurable tenant data (docs/02-system-design.md section 4.3),
// the same toggle a real school's admin would use for a lighter-weight
// leave process -- not a code change to the evidence requirement itself.
func seedPermitsPolicy(ctx context.Context, pool *pgxpool.Pool, tenantID, actorUserID uuid.UUID) error {
	q := db.New(pool)
	latest, err := q.GetLatestTenantPolicyForPermits(ctx, db.GetLatestTenantPolicyForPermitsParams{
		TenantID: tenantID, Kind: permitsPolicyKind,
	})
	nextVersion := int32(1)
	if err == nil {
		nextVersion = latest.Version + 1
		var cfg struct {
			EvidenceRequired *bool `json:"evidence_required"`
		}
		if json.Unmarshal(latest.Config, &cfg) == nil && cfg.EvidenceRequired != nil && !*cfg.EvidenceRequired {
			return nil // already off
		}
	} else if !notFound(err) {
		return fmt.Errorf("lookup permits policy: %w", err)
	}

	required := false
	config, err := json.Marshal(struct {
		EvidenceRequired *bool `json:"evidence_required"`
	}{EvidenceRequired: &required})
	if err != nil {
		return fmt.Errorf("encode permits policy: %w", err)
	}
	_, err = q.CreateTenantPolicyForPermits(ctx, db.CreateTenantPolicyForPermitsParams{
		TenantID: tenantID, Kind: permitsPolicyKind, Version: nextVersion, Config: config,
		EffectiveFrom: database.Date(clock.Real{}.Now()), CreatedBy: pgtype.UUID{Bytes: actorUserID, Valid: true},
	})
	if err != nil {
		return fmt.Errorf("create permits policy: %w", err)
	}
	return nil
}

func sameStageKeys(a, b []domain.Stage) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i].Key != b[i].Key || a[i].ApproverRule != b[i].ApproverRule {
			return false
		}
	}
	return true
}
