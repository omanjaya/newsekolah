package service

import (
	"fmt"
	"strings"

	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
)

// staffRecordNote is attached to every event a duty teacher writes on
// behalf of a student who has no phone to drive the normal QR chain, so
// the audit trail (and any reviewer reading the instance's history) can
// tell an ad-hoc desk record apart from a self-service one at a glance.
const staffRecordNote = "Dicatat langsung oleh guru piket di lokasi; siswa tidak membawa HP untuk memindai QR."

// RecordExitPermitByStaffInput is what the duty teacher submits at the
// desk/gate for a student who cannot scan a QR themselves.
type RecordExitPermitByStaffInput struct {
	TenantID      uuid.UUID
	StudentUserID uuid.UUID
	Destination   string
	StartPeriodID uuid.UUID
	EndPeriodID   uuid.UUID
	// RecordedBy is the duty teacher at the desk, distinct from
	// StudentUserID -- the asymmetry the workflow engine already carries
	// (Instance.CreatedBy vs. SubjectUserID) is the whole audit signal;
	// no new column or table is needed.
	RecordedBy uuid.UUID
}

// RecordExitPermitByStaff is the ad-hoc counterpart to CreateExitPermit +
// ExitPermitScan (x N stages) + GateScan: since the student has no phone
// to walk the chain, the duty teacher who is physically present vouches
// for the whole exit and the instance is created and completed in one
// step, exactly like a QR-driven permit in its final shape (same kind,
// same terminal status, same exit_permits row, same forced attendance
// sync) so every list, review queue and report that already reads exit
// permits picks it up unchanged. Only Instance.CreatedBy (the teacher, not
// the student) and the single closing event's Verification ("manual") and
// Note mark it as staff-recorded, instead of a parallel table.
func (s *Service) RecordExitPermitByStaff(ctx context.Context, in RecordExitPermitByStaffInput) (ExitPermitDetail, error) {
	var inst domain.Instance
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
		// Same "one exit permit per day" guard CreateExitPermit applies --
		// an ad-hoc desk record is still an exit permit, not a separate
		// concept exempt from the rule.
		if _, ok, err := s.repo.GetExitPermitInstanceForSubjectToday(ctx, in.TenantID, in.StudentUserID, s.tenantNow(ctx, in.TenantID)); err != nil {
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

		var def domain.Definition
		inst, def, err = s.createInstance(ctx, newInstanceInput{
			tenantID: in.TenantID, kind: domain.KindExitPermit, subjectUserID: in.StudentUserID,
			classID:   uuid.NullUUID{UUID: enrollment.ClassID, Valid: true},
			payload:   map[string]any{"destination": in.Destination, "recorded_by_duty_teacher": true},
			createdBy: in.RecordedBy,
		})
		if err != nil {
			return err
		}

		if _, err = s.repo.CreateExitPermit(ctx, domain.ExitPermit{
			InstanceID: inst.ID, TenantID: in.TenantID, Destination: in.Destination,
			StartPeriodID: in.StartPeriodID, EndPeriodID: in.EndPeriodID,
			StudentNameSnapshot: studentName, ClassNameSnapshot: enrollment.ClassName,
		}); err != nil {
			return err
		}

		now := s.clock.Now()
		lastIndex := len(def.Stages) - 1
		lastStage, _ := def.StageAt(lastIndex)
		if inst, err = s.repo.AdvanceInstance(ctx, in.TenantID, inst.ID, lastIndex, domain.StatusCompleted, &now); err != nil {
			return err
		}
		if _, err = s.repo.CreateEvent(ctx, domain.Event{
			TenantID: in.TenantID, InstanceID: inst.ID, StageKey: lastStage.Key,
			FromStatus: domain.StatusInProgress, ToStatus: domain.StatusCompleted,
			ActorUserID: uuid.NullUUID{UUID: in.RecordedBy, Valid: true}, Verification: domain.VerificationManual,
			Note: staffRecordNote, OccurredAt: now,
		}); err != nil {
			return err
		}
		if _, err = s.repo.MarkExitPermitIssued(ctx, in.TenantID, inst.ID, now); err != nil {
			return err
		}
		if _, err = s.repo.MarkExitPermitExited(ctx, in.TenantID, inst.ID, now, in.RecordedBy); err != nil {
			return err
		}

		startPeriod, err := s.repo.GetPeriod(ctx, in.TenantID, in.StartPeriodID)
		if err != nil {
			return err
		}
		endPeriod, err := s.repo.GetPeriod(ctx, in.TenantID, in.EndPeriodID)
		if err != nil {
			return err
		}
		day := s.tenantNow(ctx, in.TenantID)
		from := combineDateAndDuration(day, startPeriod.StartsAt)
		to := combineDateAndDuration(day, endPeriod.EndsAt)
		return s.sync.ForceStatus(ctx, in.TenantID, in.StudentUserID, from, to, "D", "exit permit (recorded by duty teacher)")
	})
	if err != nil {
		return ExitPermitDetail{}, err
	}
	s.publish(ctx, ExitPermitExited{TenantID: in.TenantID, InstanceID: inst.ID, StudentUserID: in.StudentUserID, SecurityUserID: in.RecordedBy})
	return s.GetExitPermit(ctx, in.TenantID, inst.ID)
}

// RecordLateArrivalByStaffInput is what the duty teacher submits at the
// gate for a student who cannot scan a QR themselves.
type RecordLateArrivalByStaffInput struct {
	TenantID         uuid.UUID
	StudentUserID    uuid.UUID
	Reason           string
	HomeroomReported bool
	ViolationIDs     []uuid.UUID
	RecordedBy       uuid.UUID
}

// RecordLateArrivalByStaff is the ad-hoc counterpart to OpenLateArrival +
// ReviewLateArrival + LateArrivalScan (x N stages): the duty teacher opens
// and reviews the flow for the student in one call, so occurrence
// counting, the required-action ladder and any reported violations behave
// exactly as they would for a QR-driven late arrival -- see
// RecordExitPermitByStaff's doc comment for why this reuses the same
// tables instead of a parallel one.
func (s *Service) RecordLateArrivalByStaff(ctx context.Context, in RecordLateArrivalByStaffInput) (LateArrivalDetail, error) {
	var detail LateArrivalDetail
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

		reason := strings.TrimSpace(in.Reason)
		if reason == "" {
			reason = "Terlambat datang ke sekolah"
		}

		inst, def, err := s.createInstance(ctx, newInstanceInput{
			tenantID: in.TenantID, kind: domain.KindLateArrival, subjectUserID: in.StudentUserID,
			classID: uuid.NullUUID{UUID: enrollment.ClassID, Valid: true},
			payload: map[string]any{"recorded_by_duty_teacher": true}, createdBy: in.RecordedBy,
		})
		if err != nil {
			return err
		}

		late, err := s.repo.CreateLateArrival(ctx, domain.LateArrival{
			InstanceID: inst.ID, TenantID: in.TenantID, Reason: reason, OccurrenceNumber: occurrence, RequiredAction: action,
			DutyTeacherUserID: uuid.NullUUID{UUID: in.RecordedBy, Valid: true},
		})
		if err != nil {
			return err
		}

		now := s.clock.Now()
		lastIndex := len(def.Stages) - 1
		lastStage, _ := def.StageAt(lastIndex)
		if inst, err = s.repo.AdvanceInstance(ctx, in.TenantID, inst.ID, lastIndex, domain.StatusCompleted, &now); err != nil {
			return err
		}
		if _, err = s.repo.CreateEvent(ctx, domain.Event{
			TenantID: in.TenantID, InstanceID: inst.ID, StageKey: lastStage.Key,
			FromStatus: domain.StatusInProgress, ToStatus: domain.StatusCompleted,
			ActorUserID: uuid.NullUUID{UUID: in.RecordedBy, Valid: true}, Verification: domain.VerificationManual,
			Note: staffRecordNote, OccurredAt: now,
		}); err != nil {
			return err
		}

		if late, err = s.repo.UpdateLateArrivalReview(ctx, in.TenantID, inst.ID, reason, action, in.HomeroomReported); err != nil {
			return err
		}

		if len(in.ViolationIDs) > 0 {
			note := fmt.Sprintf("Proses masuk terlambat ke-%d", late.OccurrenceNumber)
			for _, violationTypeID := range in.ViolationIDs {
				if err := s.discipline.RecordLateArrivalViolation(ctx, in.TenantID, inst.SubjectUserID, violationTypeID, inst.ID, in.RecordedBy, note); err != nil {
					return err
				}
			}
			ids := make([]string, len(in.ViolationIDs))
			for i, id := range in.ViolationIDs {
				ids[i] = id.String()
			}
			if inst, err = s.repo.MergeInstancePayload(ctx, in.TenantID, inst.ID, map[string]any{"violation_ids": ids}); err != nil {
				return err
			}
		}

		if late, err = s.repo.MarkLateArrivalCompleted(ctx, in.TenantID, inst.ID, now); err != nil {
			return err
		}

		detail = LateArrivalDetail{Instance: inst, LateArrival: late, Definition: def}
		return nil
	})
	if err != nil {
		return LateArrivalDetail{}, err
	}
	s.publish(ctx, LateArrivalUpdated{TenantID: in.TenantID, InstanceID: detail.Instance.ID, StudentUserID: in.StudentUserID, Status: string(detail.Instance.Status)})
	return detail, nil
}
