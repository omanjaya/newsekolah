package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
)

// EnsureDefaultDefinitions creates version-1 definitions for every Kind the
// tenant does not already have an active definition for, using
// domain.DefaultStages. It is called lazily (the first time a tenant needs
// a definition and none exists yet), per this module's brief -- there is
// no migration-time or platform-wide seed job.
func (s *Service) EnsureDefaultDefinitions(ctx context.Context, tenantID uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		for _, kind := range []domain.Kind{domain.KindExitPermit, domain.KindLateArrival, domain.KindLeaveRequest} {
			if _, ok, err := s.repo.GetActiveDefinition(ctx, tenantID, kind); err != nil {
				return err
			} else if ok {
				continue
			}
			def := domain.Definition{TenantID: tenantID, Kind: kind, Version: 1, IsActive: true, Stages: domain.DefaultStages(kind), Config: map[string]any{}}
			if _, err := s.repo.CreateDefinition(ctx, def); err != nil {
				return fmt.Errorf("seed default %s definition: %w", kind, err)
			}
		}
		return nil
	})
}

// activeDefinitionFor is the entry point every "create instance" call
// uses: it ensures a default exists, then returns the active one.
func (s *Service) activeDefinitionFor(ctx context.Context, tenantID uuid.UUID, kind domain.Kind) (domain.Definition, error) {
	def, ok, err := s.repo.GetActiveDefinition(ctx, tenantID, kind)
	if err != nil {
		return domain.Definition{}, err
	}
	if ok {
		return def, nil
	}
	if err := s.EnsureDefaultDefinitions(ctx, tenantID); err != nil {
		return domain.Definition{}, err
	}
	def, ok, err = s.repo.GetActiveDefinition(ctx, tenantID, kind)
	if err != nil {
		return domain.Definition{}, err
	}
	if !ok {
		return domain.Definition{}, domain.ErrDefinitionNotFound
	}
	return def, nil
}

// ListDefinitions and GetDefinition back the admin `GET
// /v1/workflows/definitions` endpoints (permission manage_workflows).
func (s *Service) ListDefinitions(ctx context.Context, tenantID uuid.UUID) ([]domain.Definition, error) {
	var out []domain.Definition
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListDefinitions(ctx, tenantID)
		return err
	})
	return out, err
}

// ReplaceDefinition validates a new stage list and, if valid, deactivates
// the current active version and inserts the new one as active -- an
// edit is always a new version, never a mutation of history, so in-flight
// instances keep referencing the definition_id they started under.
func (s *Service) ReplaceDefinition(ctx context.Context, tenantID uuid.UUID, kind domain.Kind, stages []domain.Stage, config map[string]any, actorUserID uuid.UUID) (domain.Definition, error) {
	if err := validateStages(stages); err != nil {
		return domain.Definition{}, err
	}

	var result domain.Definition
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		latest, err := s.repo.LatestDefinitionVersion(ctx, tenantID, kind)
		if err != nil {
			return err
		}
		if err := s.repo.DeactivateActiveDefinitions(ctx, tenantID, kind); err != nil {
			return err
		}
		result, err = s.repo.CreateDefinition(ctx, domain.Definition{
			TenantID: tenantID, Kind: kind, Version: latest + 1, IsActive: true,
			Stages: stages, Config: config, CreatedBy: uuid.NullUUID{UUID: actorUserID, Valid: true},
		})
		return err
	})
	return result, err
}

// validateStages enforces the shape docs/06-database-schema.md section 7
// documents: unique, non-empty stage keys; a recognized approver rule; a
// recognized verification mode; DistinctFrom entries that name an earlier
// stage (not the stage itself, not a later one -- that would be
// unsatisfiable, since the referenced stage would not have run yet).
func validateStages(stages []domain.Stage) error {
	if len(stages) == 0 {
		return fmt.Errorf("%w: at least one stage is required", domain.ErrDefinitionInvalid)
	}
	seen := make(map[string]int, len(stages))
	for i, stage := range stages {
		if stage.Key == "" {
			return fmt.Errorf("%w: stage %d has no key", domain.ErrDefinitionInvalid, i)
		}
		if _, dup := seen[stage.Key]; dup {
			return fmt.Errorf("%w: duplicate stage key %q", domain.ErrDefinitionInvalid, stage.Key)
		}
		seen[stage.Key] = i

		if !validApproverRule(stage.ApproverRule) {
			return fmt.Errorf("%w: unrecognized approver_rule %q on stage %q", domain.ErrDefinitionInvalid, stage.ApproverRule, stage.Key)
		}
		switch stage.Verification {
		case domain.VerificationQRScan, domain.VerificationManual, domain.VerificationAuto:
		default:
			return fmt.Errorf("%w: unrecognized verification %q on stage %q", domain.ErrDefinitionInvalid, stage.Verification, stage.Key)
		}
		if stage.LookaheadSlots < 0 {
			return fmt.Errorf("%w: negative lookahead_slots on stage %q", domain.ErrDefinitionInvalid, stage.Key)
		}
		for _, ref := range stage.DistinctFrom {
			priorIndex, ok := seen[ref]
			if !ok || priorIndex >= i {
				return fmt.Errorf("%w: stage %q distinct_from references %q, which must be an earlier stage", domain.ErrDefinitionInvalid, stage.Key, ref)
			}
		}
	}
	return nil
}

func validApproverRule(rule string) bool {
	switch rule {
	case domain.RuleAnyTeacher, domain.RuleTeacherOfClassNow, domain.RuleHomeroomOfStudent:
		return true
	}
	_, ok := domain.ParseDutyRule(rule)
	return ok
}

// newInstanceInput is what every kind-specific "create" use case supplies
// to createInstance; it stays private since only this package's own
// exitpermit/latearrival/leaverequest files call it.
type newInstanceInput struct {
	tenantID      uuid.UUID
	kind          domain.Kind
	subjectUserID uuid.UUID
	classID       uuid.NullUUID
	payload       map[string]any
	createdBy     uuid.UUID
}

// createInstance resolves the active definition, guards against an
// already in-progress instance of the same kind, and inserts the new
// instance plus its opening event. Callers run inside their own
// withTx (they still have kind-specific rows to insert in the same
// transaction), so this does not open one itself.
func (s *Service) createInstance(ctx context.Context, in newInstanceInput) (domain.Instance, domain.Definition, error) {
	def, err := s.activeDefinitionFor(ctx, in.tenantID, in.kind)
	if err != nil {
		return domain.Instance{}, domain.Definition{}, err
	}

	if _, ok, err := s.repo.GetInProgressInstance(ctx, in.tenantID, in.kind, in.subjectUserID); err != nil {
		return domain.Instance{}, domain.Definition{}, err
	} else if ok {
		return domain.Instance{}, domain.Definition{}, domain.ErrAlreadyInProgress
	}

	yearID, err := s.activeAcademicYear(ctx, in.tenantID)
	if err != nil {
		return domain.Instance{}, domain.Definition{}, err
	}

	inst, err := s.repo.CreateInstance(ctx, domain.Instance{
		TenantID: in.tenantID, AcademicYearID: yearID, DefinitionID: def.ID, Kind: in.kind,
		SubjectUserID: in.subjectUserID, ClassID: in.classID, Status: domain.StatusInProgress,
		Payload: in.payload, OpenedAt: s.clock.Now(),
		// LocalDate is the tenant-local calendar day, not the server's
		// UTC one -- see domain.Instance.LocalDate and migration 0120.
		LocalDate: s.tenantNow(ctx, in.tenantID), CreatedBy: uuid.NullUUID{UUID: in.createdBy, Valid: true},
	})
	if err != nil {
		return domain.Instance{}, domain.Definition{}, err
	}

	firstStage, _ := def.StageAt(0)
	_, err = s.repo.CreateEvent(ctx, domain.Event{
		TenantID: in.tenantID, InstanceID: inst.ID, StageKey: firstStage.Key,
		FromStatus: "", ToStatus: domain.StatusInProgress, ActorUserID: uuid.NullUUID{UUID: in.createdBy, Valid: true},
		Verification: domain.VerificationAuto, Note: "opened", OccurredAt: s.clock.Now(),
	})
	if err != nil {
		return domain.Instance{}, domain.Definition{}, err
	}
	return inst, def, nil
}

// stageTransitionInput is what every kind-specific "approve current
// stage" use case supplies to approveCurrentStage.
type stageTransitionInput struct {
	tenantID          uuid.UUID
	instanceID        uuid.UUID
	actorUserID       uuid.UUID
	scanTokenID       uuid.NullUUID
	note              string
	onLastStageStatus domain.Status
}

// approveCurrentStage loads the instance and its definition for update,
// checks it is still in progress, evaluates the current stage's approver
// rule against actorUserID, records the event, and advances
// current_stage_index -- or, if this was the last stage, transitions to
// in.onLastStageStatus, whose meaning is up to the caller (exit permits:
// StatusApproved, awaiting a gate scan; late arrivals and leave requests:
// StatusCompleted).
func (s *Service) approveCurrentStage(ctx context.Context, in stageTransitionInput) (domain.Instance, domain.Definition, bool, error) {
	inst, ok, err := s.repo.GetInstanceForUpdate(ctx, in.tenantID, in.instanceID)
	if err != nil {
		return domain.Instance{}, domain.Definition{}, false, err
	}
	if !ok {
		return domain.Instance{}, domain.Definition{}, false, domain.ErrInstanceNotFound
	}
	if !inst.CanTransition() {
		return domain.Instance{}, domain.Definition{}, false, domain.ErrInstanceNotInProgress
	}

	def, ok, err := s.repo.GetDefinitionByID(ctx, in.tenantID, inst.DefinitionID)
	if err != nil {
		return domain.Instance{}, domain.Definition{}, false, err
	}
	if !ok {
		return domain.Instance{}, domain.Definition{}, false, domain.ErrDefinitionNotFound
	}

	stage, err := def.StageAt(inst.CurrentStageIndex)
	if err != nil {
		return domain.Instance{}, domain.Definition{}, false, err
	}
	if err := s.evaluateApproverRule(ctx, def, inst, stage, in.actorUserID); err != nil {
		return domain.Instance{}, domain.Definition{}, false, err
	}

	nextIndex, isLast := def.NextIndex(inst.CurrentStageIndex)
	newStatus := domain.StatusInProgress
	var closedAt *time.Time
	if isLast {
		newStatus = in.onLastStageStatus
		if newStatus.IsTerminal() {
			now := s.clock.Now()
			closedAt = &now
		}
	}

	updated, err := s.repo.AdvanceInstance(ctx, in.tenantID, in.instanceID, nextIndex, newStatus, closedAt)
	if err != nil {
		return domain.Instance{}, domain.Definition{}, false, err
	}

	_, err = s.repo.CreateEvent(ctx, domain.Event{
		TenantID: in.tenantID, InstanceID: in.instanceID, StageKey: stage.Key,
		FromStatus: inst.Status, ToStatus: newStatus, ActorUserID: uuid.NullUUID{UUID: in.actorUserID, Valid: true},
		Verification: stage.Verification, ScanTokenID: in.scanTokenID, Note: in.note, OccurredAt: s.clock.Now(),
	})
	if err != nil {
		return domain.Instance{}, domain.Definition{}, false, err
	}
	return updated, def, isLast, nil
}

// rejectInstance closes an in-progress instance as rejected, recording
// the actor and reason. Any stage may reject (the rule check still
// applies -- only an eligible approver for the current stage may reject
// it, matching the old app's reviewer-only reject).
func (s *Service) rejectInstance(ctx context.Context, tenantID, instanceID, actorUserID uuid.UUID, reason string) (domain.Instance, error) {
	inst, ok, err := s.repo.GetInstanceForUpdate(ctx, tenantID, instanceID)
	if err != nil {
		return domain.Instance{}, err
	}
	if !ok {
		return domain.Instance{}, domain.ErrInstanceNotFound
	}
	if !inst.CanTransition() {
		return domain.Instance{}, domain.ErrInstanceNotInProgress
	}

	def, ok, err := s.repo.GetDefinitionByID(ctx, tenantID, inst.DefinitionID)
	if err != nil {
		return domain.Instance{}, err
	}
	if !ok {
		return domain.Instance{}, domain.ErrDefinitionNotFound
	}
	stage, err := def.StageAt(inst.CurrentStageIndex)
	if err != nil {
		return domain.Instance{}, err
	}
	if err := s.evaluateApproverRule(ctx, def, inst, stage, actorUserID); err != nil {
		return domain.Instance{}, err
	}

	now := s.clock.Now()
	updated, err := s.repo.AdvanceInstance(ctx, tenantID, instanceID, inst.CurrentStageIndex, domain.StatusRejected, &now)
	if err != nil {
		return domain.Instance{}, err
	}
	_, err = s.repo.CreateEvent(ctx, domain.Event{
		TenantID: tenantID, InstanceID: instanceID, StageKey: stage.Key,
		FromStatus: inst.Status, ToStatus: domain.StatusRejected, ActorUserID: uuid.NullUUID{UUID: actorUserID, Valid: true},
		Verification: domain.VerificationManual, Note: reason, OccurredAt: now,
	})
	return updated, err
}

// cancelInstance is the subject (or an admin) withdrawing their own
// still-open request, distinct from a reviewer rejecting it.
func (s *Service) cancelInstance(ctx context.Context, tenantID, instanceID, actorUserID uuid.UUID, reason string) (domain.Instance, error) {
	inst, ok, err := s.repo.GetInstanceForUpdate(ctx, tenantID, instanceID)
	if err != nil {
		return domain.Instance{}, err
	}
	if !ok {
		return domain.Instance{}, domain.ErrInstanceNotFound
	}
	if !inst.CanTransition() {
		return domain.Instance{}, domain.ErrInstanceNotInProgress
	}

	now := s.clock.Now()
	updated, err := s.repo.AdvanceInstance(ctx, tenantID, instanceID, inst.CurrentStageIndex, domain.StatusCancelled, &now)
	if err != nil {
		return domain.Instance{}, err
	}
	_, err = s.repo.CreateEvent(ctx, domain.Event{
		TenantID: tenantID, InstanceID: instanceID, FromStatus: inst.Status, ToStatus: domain.StatusCancelled,
		ActorUserID: uuid.NullUUID{UUID: actorUserID, Valid: true}, Verification: domain.VerificationManual,
		Note: reason, OccurredAt: now,
	})
	return updated, err
}
