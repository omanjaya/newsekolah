package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
)

// ruleContext is everything an approver rule needs to decide whether
// actorUserID may act on stage. It is built once per stage evaluation
// (evaluateApproverRule) rather than threaded as five separate parameters.
type ruleContext struct {
	tenantID       uuid.UUID
	academicYearID uuid.UUID
	classID        uuid.NullUUID
	subjectUserID  uuid.UUID
	actorUserID    uuid.UUID
	date           time.Time
	lookaheadSlots int
}

// evaluateApproverRule checks stage.ApproverRule against actorUserID, then
// (if it passes) stage.DistinctFrom against the recorded approvers of
// those earlier stage keys. Returns domain.ErrApproverNotEligible or
// domain.ErrApproverNotDistinct on failure.
func (s *Service) evaluateApproverRule(ctx context.Context, _ domain.Definition, inst domain.Instance, stage domain.Stage, actorUserID uuid.UUID) error {
	rc := ruleContext{
		tenantID:       inst.TenantID,
		academicYearID: inst.AcademicYearID,
		classID:        inst.ClassID,
		subjectUserID:  inst.SubjectUserID,
		actorUserID:    actorUserID,
		date:           s.clock.Now(),
		lookaheadSlots: stage.LookaheadSlots,
	}

	eligible, err := s.checkApproverRule(ctx, stage.ApproverRule, rc)
	if err != nil {
		return err
	}
	if !eligible {
		return domain.ErrApproverNotEligible
	}

	for _, priorKey := range stage.DistinctFrom {
		priorEvent, ok, err := s.repo.GetEventByStage(ctx, inst.TenantID, inst.ID, priorKey)
		if err != nil {
			return err
		}
		if ok && priorEvent.ActorUserID.Valid && priorEvent.ActorUserID.UUID == actorUserID {
			return domain.ErrApproverNotDistinct
		}
	}
	return nil
}

// checkApproverRule dispatches on the rule name, matching the vocabulary
// domain.DefaultStages uses (see domain/approver_rule.go).
func (s *Service) checkApproverRule(ctx context.Context, rule string, rc ruleContext) (bool, error) {
	switch rule {
	case domain.RuleAnyTeacher:
		return s.repo.IsActiveTeacher(ctx, rc.tenantID, rc.actorUserID)

	case domain.RuleTeacherOfClassNow:
		if !rc.classID.Valid {
			return false, nil
		}
		return s.schedule.IsTeacherAssignedNowOrNext(ctx, rc.tenantID, rc.actorUserID, rc.classID.UUID, rc.date, rc.lookaheadSlots)

	case domain.RuleHomeroomOfStudent:
		return s.repo.HasActiveDuty(ctx, rc.tenantID, rc.academicYearID, rc.actorUserID, "homeroom", rc.classID)

	case domain.RuleGuardianOfStudent:
		if s.guardians == nil {
			return false, nil
		}
		return s.guardians.IsApprovingGuardianOf(ctx, rc.tenantID, rc.actorUserID, rc.subjectUserID)

	default:
		if slug, ok := domain.ParseDutyRule(rule); ok {
			return s.repo.HasActiveDuty(ctx, rc.tenantID, rc.academicYearID, rc.actorUserID, slug, uuid.NullUUID{})
		}
		return false, domain.ErrDefinitionInvalid
	}
}
