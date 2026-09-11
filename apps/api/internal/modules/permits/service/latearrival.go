package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
)

// LateArrivalDetail bundles everything a client needs to render one flow.
type LateArrivalDetail struct {
	Instance    domain.Instance
	LateArrival domain.LateArrival
	Definition  domain.Definition
	Events      []domain.Event
}

type OpenLateArrivalInput struct {
	TenantID      uuid.UUID
	StudentUserID uuid.UUID
	RawToken      string
	Reason        string
}

// OpenLateArrival starts the flow when a late student scans the duty
// teacher's token (purpose late_arrival). The occurrence number is counted
// under an advisory lock so two concurrent opens cannot share a number.
func (s *Service) OpenLateArrival(ctx context.Context, in OpenLateArrivalInput) (LateArrivalDetail, error) {
	var detail LateArrivalDetail
	err := s.withTx(ctx, in.TenantID, func(ctx context.Context) error {
		token, err := s.ConsumeScanToken(ctx, ConsumeScanTokenInput{
			TenantID: in.TenantID, RawValue: in.RawToken, Purpose: domain.PurposeLateArrival, ConsumedByUserID: in.StudentUserID,
		})
		if err != nil {
			return err
		}

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

		if err := s.repo.LockSubjectForInstanceCounting(ctx, in.TenantID, in.StudentUserID); err != nil {
			return err
		}
		count, err := s.repo.CountInstancesForSubjectYear(ctx, in.TenantID, domain.KindLateArrival, in.StudentUserID, yearID)
		if err != nil {
			return err
		}
		occurrence := int(count) + 1
		actions, err := s.lateArrivalActions(ctx, in.TenantID)
		if err != nil {
			return err
		}
		action := domain.ActionForOccurrence(occurrence, actions)

		reason := in.Reason
		if reason == "" {
			reason = "Terlambat datang ke sekolah"
		}

		inst, def, err := s.createInstance(ctx, newInstanceInput{
			tenantID: in.TenantID, kind: domain.KindLateArrival, subjectUserID: in.StudentUserID,
			classID: uuid.NullUUID{UUID: enrollment.ClassID, Valid: true},
			payload: map[string]any{"opened_by_token_of": token.IssuedByUserID.String()}, createdBy: in.StudentUserID,
		})
		if err != nil {
			return err
		}
		late, err := s.repo.CreateLateArrival(ctx, domain.LateArrival{
			InstanceID: inst.ID, TenantID: in.TenantID, Reason: reason, OccurrenceNumber: occurrence, RequiredAction: action,
			DutyTeacherUserID: uuid.NullUUID{UUID: token.IssuedByUserID, Valid: true},
		})
		if err != nil {
			return err
		}
		detail = LateArrivalDetail{Instance: inst, LateArrival: late, Definition: def}
		return nil
	})
	if err != nil {
		return LateArrivalDetail{}, err
	}
	s.publish(ctx, LateArrivalOpened{TenantID: in.TenantID, InstanceID: detail.Instance.ID, StudentUserID: in.StudentUserID, ClassID: detail.Instance.ClassID})
	return detail, nil
}

type ReviewLateArrivalInput struct {
	TenantID         uuid.UUID
	InstanceID       uuid.UUID
	ReviewerUserID   uuid.UUID
	Reason           string
	HomeroomReported bool
	ViolationIDs     []uuid.UUID
}

// lateArrivalReviewPermission is the permission code ReviewLateArrival's
// "admins as fallback" check looks for, matching this endpoint's own
// x-permission in openapi/modules/permits.yaml so the fallback never grants
// more than the endpoint gate already requires.
const lateArrivalReviewPermission = "manage_attendance"

// requireLateArrivalReviewer restricts review to the specific teacher whose
// token opened the flow (docs/analysis/backend-inventory.md 1.16), with a
// role-granted manage_attendance holder (an attendance administrator, or
// super_admin) as fallback -- distinct from a picket-duty teacher's own
// manage_attendance, which is duty-granted and only ever covers the flows
// their own token opened.
func (s *Service) requireLateArrivalReviewer(ctx context.Context, tenantID, actorUserID uuid.UUID, late domain.LateArrival) error {
	if late.DutyTeacherUserID.Valid && late.DutyTeacherUserID.UUID == actorUserID {
		return nil
	}
	ok, err := s.repo.HasRolePermission(ctx, tenantID, actorUserID, lateArrivalReviewPermission)
	if err != nil {
		return err
	}
	if !ok {
		return domain.ErrLateArrivalReviewerOnly
	}
	return nil
}

// ReviewLateArrival is the duty teacher's manual approval of the first
// stage: it records the reason and the homeroom report flag, then, for
// every reviewed violation_id, records a real violation against the
// student through the discipline module (validating each id is an active
// violation type as part of that call) -- see DisciplineRecorder.
func (s *Service) ReviewLateArrival(ctx context.Context, in ReviewLateArrivalInput) (LateArrivalDetail, error) {
	var detail LateArrivalDetail
	err := s.withTx(ctx, in.TenantID, func(ctx context.Context) error {
		late, ok, err := s.repo.GetLateArrival(ctx, in.TenantID, in.InstanceID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrInstanceNotFound
		}
		if err := s.requireLateArrivalReviewer(ctx, in.TenantID, in.ReviewerUserID, late); err != nil {
			return err
		}
		inst, def, isLast, err := s.approveCurrentStage(ctx, stageTransitionInput{
			tenantID: in.TenantID, instanceID: in.InstanceID, actorUserID: in.ReviewerUserID,
			note: "reviewed by duty teacher", onLastStageStatus: domain.StatusCompleted,
		})
		if err != nil {
			return err
		}
		reason := in.Reason
		if reason == "" {
			reason = late.Reason
		}
		late, err = s.repo.UpdateLateArrivalReview(ctx, in.TenantID, in.InstanceID, reason, late.RequiredAction, in.HomeroomReported)
		if err != nil {
			return err
		}
		if len(in.ViolationIDs) > 0 {
			note := fmt.Sprintf("Proses masuk terlambat ke-%d", late.OccurrenceNumber)
			for _, violationTypeID := range in.ViolationIDs {
				if err := s.discipline.RecordLateArrivalViolation(ctx, in.TenantID, inst.SubjectUserID, violationTypeID, in.InstanceID, in.ReviewerUserID, note); err != nil {
					return err
				}
			}
			ids := make([]string, len(in.ViolationIDs))
			for i, id := range in.ViolationIDs {
				ids[i] = id.String()
			}
			if inst, err = s.repo.MergeInstancePayload(ctx, in.TenantID, in.InstanceID, map[string]any{"violation_ids": ids}); err != nil {
				return err
			}
		}
		if isLast {
			if late, err = s.repo.MarkLateArrivalCompleted(ctx, in.TenantID, in.InstanceID, s.clock.Now()); err != nil {
				return err
			}
		}
		detail = LateArrivalDetail{Instance: inst, LateArrival: late, Definition: def}
		return nil
	})
	if err != nil {
		return LateArrivalDetail{}, err
	}
	s.publish(ctx, LateArrivalUpdated{TenantID: in.TenantID, InstanceID: in.InstanceID, StudentUserID: detail.Instance.SubjectUserID, Status: string(detail.Instance.Status)})
	return detail, nil
}

// LateArrivalScan advances the flow when the student scans the next
// approver's token (leadership, then class teacher).
func (s *Service) LateArrivalScan(ctx context.Context, tenantID, instanceID, studentUserID uuid.UUID, rawToken string) (LateArrivalDetail, error) {
	var detail LateArrivalDetail
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		inst, ok, err := s.repo.GetInstance(ctx, tenantID, instanceID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrInstanceNotFound
		}
		if inst.SubjectUserID != studentUserID {
			return domain.ErrNotWorkflowSubject
		}
		token, err := s.ConsumeScanToken(ctx, ConsumeScanTokenInput{
			TenantID: tenantID, RawValue: rawToken, Purpose: domain.PurposeApproveStage,
			ContextID: uuid.NullUUID{UUID: instanceID, Valid: true}, ConsumedByUserID: studentUserID,
		})
		if err != nil {
			return err
		}
		updated, def, isLast, err := s.approveCurrentStage(ctx, stageTransitionInput{
			tenantID: tenantID, instanceID: instanceID, actorUserID: token.IssuedByUserID,
			scanTokenID: uuid.NullUUID{UUID: token.ID, Valid: true}, onLastStageStatus: domain.StatusCompleted,
		})
		if err != nil {
			return err
		}
		late, _, err := s.repo.GetLateArrival(ctx, tenantID, instanceID)
		if err != nil {
			return err
		}
		if isLast {
			if late, err = s.repo.MarkLateArrivalCompleted(ctx, tenantID, instanceID, s.clock.Now()); err != nil {
				return err
			}
		}
		detail = LateArrivalDetail{Instance: updated, LateArrival: late, Definition: def}
		return nil
	})
	if err != nil {
		return LateArrivalDetail{}, err
	}
	s.publish(ctx, LateArrivalUpdated{TenantID: tenantID, InstanceID: instanceID, StudentUserID: studentUserID, Status: string(detail.Instance.Status)})
	return detail, nil
}

func (s *Service) GetLateArrival(ctx context.Context, tenantID, instanceID uuid.UUID) (LateArrivalDetail, error) {
	var detail LateArrivalDetail
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		inst, ok, err := s.repo.GetInstance(ctx, tenantID, instanceID)
		if err != nil {
			return err
		}
		if !ok || inst.Kind != domain.KindLateArrival {
			return domain.ErrInstanceNotFound
		}
		late, ok, err := s.repo.GetLateArrival(ctx, tenantID, instanceID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrInstanceNotFound
		}
		def, _, err := s.repo.GetDefinitionByID(ctx, tenantID, inst.DefinitionID)
		if err != nil {
			return err
		}
		events, err := s.repo.ListEvents(ctx, tenantID, instanceID)
		if err != nil {
			return err
		}
		detail = LateArrivalDetail{Instance: inst, LateArrival: late, Definition: def, Events: events}
		return nil
	})
	return detail, err
}

// CurrentLateArrival returns the student's in-progress flow, if any.
func (s *Service) CurrentLateArrival(ctx context.Context, tenantID, studentUserID uuid.UUID) (LateArrivalDetail, bool, error) {
	var (
		detail LateArrivalDetail
		found  bool
	)
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		inst, ok, err := s.repo.GetInProgressInstance(ctx, tenantID, domain.KindLateArrival, studentUserID)
		if err != nil || !ok {
			return err
		}
		found = true
		late, _, err := s.repo.GetLateArrival(ctx, tenantID, inst.ID)
		if err != nil {
			return err
		}
		def, _, err := s.repo.GetDefinitionByID(ctx, tenantID, inst.DefinitionID)
		if err != nil {
			return err
		}
		events, err := s.repo.ListEvents(ctx, tenantID, inst.ID)
		if err != nil {
			return err
		}
		detail = LateArrivalDetail{Instance: inst, LateArrival: late, Definition: def, Events: events}
		return nil
	})
	return detail, found, err
}

func (s *Service) ListLateArrivalsForReview(ctx context.Context, tenantID, callerUserID uuid.UUID) ([]LateArrivalReviewItem, error) {
	var out []LateArrivalReviewItem
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListLateArrivalsForReview(ctx, tenantID, callerUserID)
		return err
	})
	if err != nil {
		return nil, fmt.Errorf("list late arrivals: %w", err)
	}
	return out, nil
}
