package service

import (
	"context"
	"errors"
	"fmt"
	"sort"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

// LateArrivalDetail bundles everything a client needs to render one flow.
type LateArrivalDetail struct {
	Instance    domain.Instance
	LateArrival domain.LateArrival
	Definition  domain.Definition
	Events      []domain.Event
	// ClassName names the class the flow was opened in, so an approver
	// can tell two students of the same name apart; "" when unknown.
	ClassName string
}

// lateArrivalClassName reads the display name of the class a flow was
// opened in. A late arrival keeps no name snapshot (unlike an exit permit),
// so this is a live read; a flow with no class gets "".
func (s *Service) lateArrivalClassName(ctx context.Context, tenantID uuid.UUID, inst domain.Instance) (string, error) {
	if !inst.ClassID.Valid {
		return "", nil
	}
	return s.repo.GetClassName(ctx, tenantID, inst.ClassID.UUID)
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
		detail = LateArrivalDetail{Instance: inst, LateArrival: late, Definition: def, ClassName: enrollment.ClassName}
		return nil
	})
	if err != nil {
		return LateArrivalDetail{}, err
	}
	s.publish(ctx, LateArrivalOpened{TenantID: in.TenantID, InstanceID: detail.Instance.ID, StudentUserID: in.StudentUserID, ClassID: detail.Instance.ClassID})
	// Live push to the picket teacher's review queue (docs/analysis/
	// realtime-plan-2026-09-25.md section 2, opportunity #1) -- every
	// default definition's late-arrival flow opens on the "duty_teacher"
	// stage, so this is not stage-conditional the way exit permits are.
	s.publishToDutyStage(ctx, in.TenantID, uuid.NullUUID{}, "duty_teacher", "late_arrival.opened", instanceEventPayload{InstanceID: detail.Instance.ID})
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
//
// While discipline is switched off the review still goes through, but the
// selected violation_ids are dropped: nothing is recorded in discipline and
// nothing is merged into the flow's payload.
func (s *Service) ReviewLateArrival(ctx context.Context, in ReviewLateArrivalInput) (LateArrivalDetail, error) {
	violationIDs, err := s.reviewedViolations(ctx, in.TenantID, in.ViolationIDs)
	if err != nil {
		return LateArrivalDetail{}, err
	}
	in.ViolationIDs = violationIDs
	var detail LateArrivalDetail
	err = s.withTx(ctx, in.TenantID, func(ctx context.Context) error {
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
		// Manual only: the review form records the picket teacher's
		// judgement, and must never stand in for a later stage (leadership,
		// class teacher) whose approver has to show their own QR.
		inst, def, isLast, err := s.approveCurrentStage(ctx, stageTransitionInput{
			tenantID: in.TenantID, instanceID: in.InstanceID, actorUserID: in.ReviewerUserID,
			note: domain.NoteReviewedByDutyTeacher, onLastStageStatus: domain.StatusCompleted,
			verification: domain.VerificationManual,
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
		if inst, err = s.recordReviewedViolations(ctx, in.TenantID, inst, in.ReviewerUserID, in.ViolationIDs, late.OccurrenceNumber); err != nil {
			return err
		}
		if isLast {
			if late, err = s.repo.MarkLateArrivalCompleted(ctx, in.TenantID, in.InstanceID, clock.Now(ctx, s.clock)); err != nil {
				return err
			}
		}
		className, err := s.lateArrivalClassName(ctx, in.TenantID, inst)
		if err != nil {
			return err
		}
		detail = LateArrivalDetail{Instance: inst, LateArrival: late, Definition: def, ClassName: className}
		return nil
	})
	if err != nil {
		return LateArrivalDetail{}, err
	}
	s.publish(ctx, LateArrivalUpdated{TenantID: in.TenantID, InstanceID: in.InstanceID, StudentUserID: detail.Instance.SubjectUserID, Status: string(detail.Instance.Status)})
	s.publishToDutyStage(ctx, in.TenantID, uuid.NullUUID{}, "duty_teacher", "late_arrival.updated", instanceEventPayload{InstanceID: in.InstanceID})
	s.publishToNextLateStage(ctx, in.TenantID, detail)
	return detail, nil
}

// publishToNextLateStage tells the holders of the stage a late arrival now
// waits at (leadership, after the picket review) that their queue gained
// it, so the approver's inbox lists the student before they walk up. A
// stage with no duty group (class_teacher) is skipped by
// publishToDutyStage; that teacher's queue picks the flow up on its poll.
func (s *Service) publishToNextLateStage(ctx context.Context, tenantID uuid.UUID, detail LateArrivalDetail) {
	if detail.Instance.Status != domain.StatusInProgress {
		return
	}
	stage, err := detail.Definition.StageAt(detail.Instance.CurrentStageIndex)
	if err != nil || stage.Key == "duty_teacher" {
		return
	}
	s.publishToDutyStage(ctx, tenantID, detail.Instance.ClassID, stage.Key, "late_arrival.updated", instanceEventPayload{InstanceID: detail.Instance.ID})
}

// recordReviewedViolations records each reviewed violation in discipline
// and keeps the list on the flow's payload, returning the updated instance
// (inst unchanged when there is nothing to record). Callers pass the list
// through reviewedViolations first, which empties it while discipline is
// off.
func (s *Service) recordReviewedViolations(
	ctx context.Context, tenantID uuid.UUID, inst domain.Instance, reporterUserID uuid.UUID, violationIDs []uuid.UUID, occurrence int,
) (domain.Instance, error) {
	if len(violationIDs) == 0 {
		return inst, nil
	}
	note := fmt.Sprintf("Proses masuk terlambat ke-%d", occurrence)
	ids := make([]string, len(violationIDs))
	for i, violationTypeID := range violationIDs {
		if err := s.discipline.RecordLateArrivalViolation(ctx, tenantID, inst.SubjectUserID, violationTypeID, inst.ID, reporterUserID, note); err != nil {
			return domain.Instance{}, err
		}
		ids[i] = violationTypeID.String()
	}
	return s.repo.MergeInstancePayload(ctx, tenantID, inst.ID, map[string]any{"violation_ids": ids})
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
		if !ok || inst.Kind != domain.KindLateArrival {
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
			verification: domain.VerificationQRScan,
		})
		if err != nil {
			return err
		}
		late, _, err := s.repo.GetLateArrival(ctx, tenantID, instanceID)
		if err != nil {
			return err
		}
		if isLast {
			if late, err = s.repo.MarkLateArrivalCompleted(ctx, tenantID, instanceID, clock.Now(ctx, s.clock)); err != nil {
				return err
			}
		}
		className, err := s.lateArrivalClassName(ctx, tenantID, updated)
		if err != nil {
			return err
		}
		detail = LateArrivalDetail{Instance: updated, LateArrival: late, Definition: def, ClassName: className}
		return nil
	})
	if err != nil {
		return LateArrivalDetail{}, err
	}
	s.publish(ctx, LateArrivalUpdated{TenantID: tenantID, InstanceID: instanceID, StudentUserID: studentUserID, Status: string(detail.Instance.Status)})
	s.publishToDutyStage(ctx, tenantID, uuid.NullUUID{}, "duty_teacher", "late_arrival.updated", instanceEventPayload{InstanceID: instanceID})
	s.publishToNextLateStage(ctx, tenantID, detail)
	return detail, nil
}

// ListMyLateArrivals is the student's own late-arrival history, newest
// first: open and finished flows alike, including one the duty teacher
// recorded by hand, which is completed when it is created and so never
// shows up in GetCurrentLateArrival.
func (s *Service) ListMyLateArrivals(ctx context.Context, tenantID, studentUserID uuid.UUID, limit, offset int) ([]LateArrivalReviewItem, error) {
	items, err := s.listInstancesWithDefinitions(ctx, tenantID, domain.KindLateArrival, studentUserID, limit, offset)
	if err != nil {
		return nil, err
	}
	out := make([]LateArrivalReviewItem, 0, len(items))
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		for _, it := range items {
			late, ok, err := s.repo.GetLateArrival(ctx, tenantID, it.Instance.ID)
			if err != nil {
				return err
			}
			if !ok {
				continue
			}
			inst := it.Instance
			stage, _ := it.Definition.StageAt(min(inst.CurrentStageIndex, len(it.Definition.Stages)-1))
			out = append(out, LateArrivalReviewItem{
				LateArrival: late, SubjectUserID: inst.SubjectUserID, ClassID: inst.ClassID,
				AcademicYearID: inst.AcademicYearID, CurrentStageIndex: inst.CurrentStageIndex,
				CurrentStage: stage, Status: inst.Status, OpenedAt: inst.OpenedAt,
			})
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("list my late arrivals: %w", err)
	}
	return out, nil
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
		className, err := s.lateArrivalClassName(ctx, tenantID, inst)
		if err != nil {
			return err
		}
		detail = LateArrivalDetail{Instance: inst, LateArrival: late, Definition: def, Events: events, ClassName: className}
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
		// A late arrival is day bound: only today's flow is current.
		today := s.tenantNow(ctx, tenantID)
		inst, ok, err := s.repo.GetInProgressInstance(ctx, tenantID, domain.KindLateArrival, studentUserID, &today)
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
		className, err := s.lateArrivalClassName(ctx, tenantID, inst)
		if err != nil {
			return err
		}
		detail = LateArrivalDetail{Instance: inst, LateArrival: late, Definition: def, Events: events, ClassName: className}
		return nil
	})
	return detail, found, err
}

// CountLateArrivalsForReview is ListLateArrivalsForReview's queue size for
// the same caller, for the action inbox badge. It counts the list itself,
// so the badge can never disagree with the queue it opens. The inbox polls
// it for every signed-in user, so the list keeps its cost low for callers
// who approve nothing (see ListLateArrivalsForReview).
func (s *Service) CountLateArrivalsForReview(ctx context.Context, tenantID, callerUserID uuid.UUID) (int, error) {
	items, err := s.ListLateArrivalsForReview(ctx, tenantID, callerUserID)
	if err != nil {
		return 0, fmt.Errorf("count late arrivals: %w", err)
	}
	return len(items), nil
}

// ListLateArrivalsForReview is every open late arrival waiting on the
// caller, oldest first, in two kinds:
//
//   - at a manual stage (the picket review), for the teacher whose token
//     opened it or a role-granted manage_attendance holder (queries/
//     late_arrivals.sql); the caller reviews it with the form;
//   - at a qr_scan stage (leadership, the class teacher) whose approver
//     rule and DistinctFrom the caller satisfies right now -- the same
//     evaluation LateArrivalScan runs on the scan, so the queue lists a
//     flow exactly when the caller's stage QR would be accepted. The
//     caller approves it by showing the student that QR.
//
// Each item carries its CurrentStage so the client can tell the two apart.
//
// The badge polls this for every user, so the qr_scan half is kept cheap:
// a student (who can pass no approver rule) skips it outright, and for
// everyone else each distinct rule input is evaluated once per call
// rather than once per flow -- a day's late arrivals mostly wait at the
// same duty stage, so a caller who is not its holder costs one lookup, not
// one per student. DistinctFrom, which reads that flow's own history, only
// runs for a flow whose rule the caller passed.
func (s *Service) ListLateArrivalsForReview(ctx context.Context, tenantID, callerUserID uuid.UUID) ([]LateArrivalReviewItem, error) {
	var out []LateArrivalReviewItem
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		review, err := s.repo.ListLateArrivalsForReview(ctx, tenantID, callerUserID)
		if err != nil {
			return err
		}
		out = review
		student, err := s.repo.IsStudentProfile(ctx, tenantID, callerUserID)
		if err != nil || student {
			return err
		}
		atScan, err := s.repo.ListLateArrivalsAtScanStage(ctx, tenantID)
		if err != nil || len(atScan) == 0 {
			return err
		}
		approvable, err := s.scanStagesApprovableBy(ctx, tenantID, callerUserID, atScan)
		if err != nil {
			return err
		}
		out = append(out, approvable...)
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("list late arrivals: %w", err)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].OpenedAt.Before(out[j].OpenedAt) })
	return out, nil
}

// approverRuleInput is everything checkApproverRule reads besides the
// actor and the time, so flows that share it share one evaluation.
type approverRuleInput struct {
	rule           string
	academicYearID uuid.UUID
	classID        uuid.NullUUID
	lookaheadSlots int
}

// scanStagesApprovableBy narrows items (each waiting at a qr_scan stage)
// to those whose approver rule and DistinctFrom actorUserID passes right
// now. A rule the caller fails, or one a hand-edited definition names but
// the engine does not know (ErrDefinitionInvalid), drops the flow rather
// than failing the whole queue.
func (s *Service) scanStagesApprovableBy(ctx context.Context, tenantID, actorUserID uuid.UUID, items []LateArrivalReviewItem) ([]LateArrivalReviewItem, error) {
	now := s.tenantNow(ctx, tenantID)
	passed := make(map[approverRuleInput]bool)
	var out []LateArrivalReviewItem
	for _, item := range items {
		inst, stage := item.instance(), item.CurrentStage
		key := approverRuleInput{rule: stage.ApproverRule, academicYearID: inst.AcademicYearID, classID: inst.ClassID, lookaheadSlots: stage.LookaheadSlots}
		eligible, seen := passed[key]
		if !seen {
			var err error
			eligible, err = s.checkApproverRule(ctx, stage.ApproverRule, newRuleContext(inst, stage, actorUserID, now))
			if err != nil && !errors.Is(err, domain.ErrDefinitionInvalid) {
				return nil, err
			}
			passed[key] = eligible
		}
		if !eligible {
			continue
		}
		switch err := s.checkDistinctFrom(ctx, inst, stage, actorUserID); {
		case err == nil:
			out = append(out, item)
		case errors.Is(err, domain.ErrApproverNotDistinct):
		default:
			return nil, err
		}
	}
	return out, nil
}

// isStageApprover reports whether actorUserID would pass stage's approver
// rule and DistinctFrom on inst right now, turning the rule's own refusal
// into false instead of an error.
func (s *Service) isStageApprover(ctx context.Context, inst domain.Instance, stage domain.Stage, actorUserID uuid.UUID) (bool, error) {
	err := s.evaluateApproverRule(ctx, domain.Definition{}, inst, stage, actorUserID)
	switch {
	case err == nil:
		return true, nil
	case errors.Is(err, domain.ErrApproverNotEligible), errors.Is(err, domain.ErrApproverNotDistinct), errors.Is(err, domain.ErrDefinitionInvalid):
		return false, nil
	default:
		return false, err
	}
}
