package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
)

// CreateExitPermitInput is what a student submits to start an exit
// permit. destination is free text (e.g. "Puskesmas", "Jemput adik");
// start/end period IDs bound the time range the permit covers.
type CreateExitPermitInput struct {
	TenantID      uuid.UUID
	StudentUserID uuid.UUID
	Destination   string
	StartPeriodID uuid.UUID
	EndPeriodID   uuid.UUID
}

// CreateExitPermit opens a new exit-permit workflow. Bug fix vs. the old
// app (docs/analysis/backend-inventory.md 1.15): "one in-progress permit
// per day, none unexited" is enforced by
// ux_workflow_instances_one_exit_permit_per_day, not a racy COUNT query,
// and the period range is validated by sequence order here instead of
// trusting the client's start < end.
func (s *Service) CreateExitPermit(ctx context.Context, in CreateExitPermitInput) (domain.Instance, domain.ExitPermit, error) {
	var (
		inst domain.Instance
		perm domain.ExitPermit
	)
	err := s.withTx(ctx, in.TenantID, func(ctx context.Context) error {
		yearID, err := s.activeAcademicYear(ctx, in.TenantID)
		if err != nil {
			return err
		}
		enrollment, ok, err := s.repo.GetActiveEnrollment(ctx, in.TenantID, yearID, in.StudentUserID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrEnrollmentNotFound
		}

		// Regression fix (docs/analysis/backend-inventory.md 1.15): at
		// most one exit permit per day regardless of status, including
		// ones that already exited -- the DB unique index enforces this
		// too (ux_workflow_instances_one_exit_permit_per_day now covers
		// 'completed'), but this turns the race into a friendly 409
		// instead of a raw unique-violation.
		if _, ok, err := s.repo.GetExitPermitInstanceForSubjectToday(ctx, in.TenantID, in.StudentUserID); err != nil {
			return err
		} else if ok {
			return domain.ErrExitPermitAlreadyToday
		}

		if err := s.validatePeriodRange(ctx, in.TenantID, in.StartPeriodID, in.EndPeriodID); err != nil {
			return err
		}

		studentName, err := s.repo.GetUserName(ctx, in.TenantID, in.StudentUserID)
		if err != nil {
			return err
		}

		inst, _, err = s.createInstance(ctx, newInstanceInput{
			tenantID: in.TenantID, kind: domain.KindExitPermit, subjectUserID: in.StudentUserID,
			classID: uuid.NullUUID{UUID: enrollment.ClassID, Valid: true},
			payload: map[string]any{"destination": in.Destination}, createdBy: in.StudentUserID,
		})
		if err != nil {
			return err
		}

		perm, err = s.repo.CreateExitPermit(ctx, domain.ExitPermit{
			InstanceID: inst.ID, TenantID: in.TenantID, Destination: in.Destination,
			StartPeriodID: in.StartPeriodID, EndPeriodID: in.EndPeriodID,
			StudentNameSnapshot: studentName, ClassNameSnapshot: enrollment.ClassName,
		})
		return err
	})
	if err != nil {
		return domain.Instance{}, domain.ExitPermit{}, err
	}

	s.publish(ctx, ExitPermitStageChanged{TenantID: in.TenantID, InstanceID: inst.ID, StudentUserID: in.StudentUserID, StageKey: "duty_teacher"})
	return inst, perm, nil
}

// validatePeriodRange checks that endPeriodID's sequence is strictly
// after startPeriodID's within the same template -- the only ordering
// concept periods carries, since two templates need not share a day
// layout. Bug fix vs. the old app, which compared period IDs directly.
func (s *Service) validatePeriodRange(ctx context.Context, tenantID, startPeriodID, endPeriodID uuid.UUID) error {
	start, err := s.repo.GetPeriod(ctx, tenantID, startPeriodID)
	if err != nil {
		return fmt.Errorf("look up start period: %w", err)
	}
	end, err := s.repo.GetPeriod(ctx, tenantID, endPeriodID)
	if err != nil {
		return fmt.Errorf("look up end period: %w", err)
	}
	if start.TemplateID != end.TemplateID || end.Sequence <= start.Sequence {
		return domain.ErrPeriodRangeInvalid
	}
	return nil
}

// ExitPermitScan is what a student calls after scanning the current
// stage's approving teacher's QR code. The token's issuer (the teacher who
// displayed the code), not the scanning student, is who the approver rule
// is evaluated against -- see docs/02-system-design.md section 6.2.
func (s *Service) ExitPermitScan(ctx context.Context, tenantID, instanceID, scannerUserID uuid.UUID, rawToken string) (domain.Instance, error) {
	var updated domain.Instance
	var isLast bool
	var nextStageKey string
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		inst, ok, err := s.repo.GetInstance(ctx, tenantID, instanceID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrInstanceNotFound
		}
		if inst.SubjectUserID != scannerUserID {
			return domain.ErrNotWorkflowSubject
		}

		token, err := s.ConsumeScanToken(ctx, ConsumeScanTokenInput{
			TenantID: tenantID, RawValue: rawToken, Purpose: domain.PurposeApproveStage,
			ContextID: uuid.NullUUID{UUID: instanceID, Valid: true}, ConsumedByUserID: scannerUserID,
		})
		if err != nil {
			return err
		}

		var def domain.Definition
		updated, def, isLast, err = s.approveCurrentStage(ctx, stageTransitionInput{
			tenantID: tenantID, instanceID: instanceID, actorUserID: token.IssuedByUserID,
			scanTokenID: uuid.NullUUID{UUID: token.ID, Valid: true}, onLastStageStatus: domain.StatusApproved,
		})
		if err != nil {
			return err
		}

		if isLast {
			_, err = s.repo.MarkExitPermitIssued(ctx, tenantID, instanceID, s.clock.Now())
		} else if stage, stageErr := def.StageAt(updated.CurrentStageIndex); stageErr == nil {
			nextStageKey = stage.Key
		}
		return err
	})
	if err != nil {
		return domain.Instance{}, err
	}

	if isLast {
		s.publish(ctx, ExitPermitIssued{TenantID: tenantID, InstanceID: instanceID, StudentUserID: updated.SubjectUserID})
	} else {
		s.publish(ctx, ExitPermitStageChanged{TenantID: tenantID, InstanceID: instanceID, StudentUserID: updated.SubjectUserID, StageKey: nextStageKey})
	}
	return updated, nil
}

// CancelExitPermit lets the student withdraw their own not-yet-exited
// permit (docs/analysis/backend-inventory.md 1.15: "Cancel bila belum
// exited").
func (s *Service) CancelExitPermit(ctx context.Context, tenantID, instanceID, actorUserID uuid.UUID) (domain.Instance, error) {
	return s.cancelInstance(ctx, tenantID, instanceID, actorUserID, "cancelled by student")
}

// IssueGateToken mints the gate_exit token once every approval stage has
// passed (instance status StatusApproved), valid until the end of the
// permit's end period on the day it is issued.
func (s *Service) IssueGateToken(ctx context.Context, tenantID, instanceID, issuedByUserID uuid.UUID) (domain.IssueResult, error) {
	var result domain.IssueResult
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		inst, ok, err := s.repo.GetInstance(ctx, tenantID, instanceID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrInstanceNotFound
		}
		if inst.Status != domain.StatusApproved {
			return domain.ErrExitPermitNotIssued
		}
		permit, ok, err := s.repo.GetExitPermit(ctx, tenantID, instanceID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrInstanceNotFound
		}

		endPeriod, err := s.repo.GetPeriod(ctx, tenantID, permit.EndPeriodID)
		if err != nil {
			return err
		}
		// Tenant-local, not s.clock.Now() directly: EndsAt is a
		// wall-clock time of day in the tenant's own timezone, and
		// combineDateAndDuration needs a same-timezone date to combine it
		// with (docs/analysis/backend-inventory.md 1.15).
		periodEndsAt := combineDateAndDuration(s.tenantNow(ctx, tenantID), endPeriod.EndsAt)

		result, err = s.IssueScanToken(ctx, IssueScanTokenInput{
			TenantID: tenantID, Purpose: domain.PurposeGateExit,
			ContextID: uuid.NullUUID{UUID: instanceID, Valid: true}, IssuedByUserID: issuedByUserID,
			PeriodEndsAt: periodEndsAt,
		})
		if err != nil {
			return err
		}
		_, err = s.repo.SetExitPermitGateToken(ctx, tenantID, instanceID, result.Token.ID)
		return err
	})
	return result, err
}

// GateScan is security scanning the gate token as the student physically
// leaves, closing the workflow. Bug fix vs. the old app
// (docs/analysis/backend-inventory.md 1.15): consumption is the same
// atomic ConsumeScanToken every other purpose uses, not a bespoke
// FOR UPDATE query.
func (s *Service) GateScan(ctx context.Context, tenantID, instanceID, securityUserID uuid.UUID, rawToken string) (domain.Instance, error) {
	var updated domain.Instance
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		inst, ok, err := s.repo.GetInstanceForUpdate(ctx, tenantID, instanceID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrInstanceNotFound
		}
		if inst.Status != domain.StatusApproved {
			return domain.ErrExitPermitNotIssued
		}

		token, err := s.ConsumeScanToken(ctx, ConsumeScanTokenInput{
			TenantID: tenantID, RawValue: rawToken, Purpose: domain.PurposeGateExit,
			ContextID: uuid.NullUUID{UUID: instanceID, Valid: true}, ConsumedByUserID: securityUserID,
		})
		if err != nil {
			return err
		}

		now := s.clock.Now()
		updated, err = s.repo.AdvanceInstance(ctx, tenantID, instanceID, inst.CurrentStageIndex, domain.StatusCompleted, &now)
		if err != nil {
			return err
		}
		if _, err := s.repo.MarkExitPermitExited(ctx, tenantID, instanceID, now, securityUserID); err != nil {
			return err
		}
		_, err = s.repo.CreateEvent(ctx, domain.Event{
			TenantID: tenantID, InstanceID: instanceID, StageKey: "gate", FromStatus: inst.Status, ToStatus: domain.StatusCompleted,
			ActorUserID: uuid.NullUUID{UUID: securityUserID, Valid: true}, Verification: domain.VerificationQRScan,
			ScanTokenID: uuid.NullUUID{UUID: token.ID, Valid: true}, Note: "gate exit", OccurredAt: now,
		})
		if err != nil {
			return err
		}

		permit, ok, err := s.repo.GetExitPermit(ctx, tenantID, instanceID)
		if err != nil || !ok {
			return err
		}
		startPeriod, err := s.repo.GetPeriod(ctx, tenantID, permit.StartPeriodID)
		if err != nil {
			return err
		}
		endPeriod, err := s.repo.GetPeriod(ctx, tenantID, permit.EndPeriodID)
		if err != nil {
			return err
		}
		// Bug fix vs. the old app: forced attendance status only overrides
		// sessions within the permit's own period range, not the whole day.
		// Tenant-local, not s.clock.Now() directly, for the same reason as
		// IssueGateToken's periodEndsAt above.
		day := s.tenantNow(ctx, tenantID)
		from := combineDateAndDuration(day, startPeriod.StartsAt)
		to := combineDateAndDuration(day, endPeriod.EndsAt)
		// "D" (dispensasi) matches tenant_policies(kind='attendance_statuses')
		// default codes (docs/06-database-schema.md section 6): an exit
		// permit is dispensation, distinct from a planned leave ("I").
		return s.sync.ForceStatus(ctx, tenantID, inst.SubjectUserID, from, to, "D", "exit permit")
	})
	if err != nil {
		return domain.Instance{}, err
	}
	s.publish(ctx, ExitPermitExited{TenantID: tenantID, InstanceID: instanceID, StudentUserID: updated.SubjectUserID, SecurityUserID: securityUserID})
	return updated, nil
}

// ListExitPermitsForApproval is the counselor/leadership/security queue:
// missing feature (docs/analysis/backend-inventory.md 1.15) -- in-progress
// permits at a duty-scoped approval stage the caller may act on, plus
// every approved permit visible to scan_exit_permits holders awaiting
// their gate scan.
func (s *Service) ListExitPermitsForApproval(ctx context.Context, tenantID, callerUserID uuid.UUID) ([]ExitPermitReviewItem, error) {
	var out []ExitPermitReviewItem
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListExitPermitsForApproval(ctx, tenantID, callerUserID)
		return err
	})
	return out, err
}
