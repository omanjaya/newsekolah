package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
)

// PendingCount is how many of kind (leave_request, exit_permit,
// late_arrival) currently have status='in_progress'. Used by the admin
// dashboard's pending-queues panel (analytics module).
func (s *Service) PendingCount(ctx context.Context, tenantID uuid.UUID, kind domain.Kind) (int, error) {
	var count int64
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		count, err = s.repo.CountInProgressInstances(ctx, tenantID, kind)
		return err
	})
	return int(count), err
}

// ExitPermitDetail bundles an exit permit with its workflow state.
type ExitPermitDetail struct {
	Instance   domain.Instance
	Definition domain.Definition
	Permit     domain.ExitPermit
	Events     []domain.Event
}

func (s *Service) GetExitPermit(ctx context.Context, tenantID, instanceID uuid.UUID) (ExitPermitDetail, error) {
	var detail ExitPermitDetail
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		inst, ok, err := s.repo.GetInstance(ctx, tenantID, instanceID)
		if err != nil {
			return err
		}
		if !ok || inst.Kind != domain.KindExitPermit {
			return domain.ErrInstanceNotFound
		}
		permit, ok, err := s.repo.GetExitPermit(ctx, tenantID, instanceID)
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
		detail = ExitPermitDetail{Instance: inst, Definition: def, Permit: permit, Events: events}
		return nil
	})
	return detail, err
}

// InstanceWithDefinition is a list item: the instance plus the definition
// that governs it, so clients can label the current stage.
type InstanceWithDefinition struct {
	Instance   domain.Instance
	Definition domain.Definition
}

func (s *Service) ListMyExitPermits(ctx context.Context, tenantID, studentUserID uuid.UUID, limit, offset int) ([]InstanceWithDefinition, error) {
	return s.listInstancesWithDefinitions(ctx, tenantID, domain.KindExitPermit, studentUserID, limit, offset)
}

func (s *Service) listInstancesWithDefinitions(ctx context.Context, tenantID uuid.UUID, kind domain.Kind, subjectUserID uuid.UUID, limit, offset int) ([]InstanceWithDefinition, error) {
	var out []InstanceWithDefinition
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		instances, err := s.repo.ListInstancesBySubject(ctx, tenantID, kind, subjectUserID, clampPage(limit), max(offset, 0))
		if err != nil {
			return err
		}
		defs := map[uuid.UUID]domain.Definition{}
		out = make([]InstanceWithDefinition, 0, len(instances))
		for _, inst := range instances {
			def, ok := defs[inst.DefinitionID]
			if !ok {
				def, _, err = s.repo.GetDefinitionByID(ctx, tenantID, inst.DefinitionID)
				if err != nil {
					return err
				}
				defs[inst.DefinitionID] = def
			}
			out = append(out, InstanceWithDefinition{Instance: inst, Definition: def})
		}
		return nil
	})
	return out, err
}

// RequireSubject fails unless userID is the subject of the given instance.
func (s *Service) RequireSubject(ctx context.Context, tenantID, instanceID, userID uuid.UUID, kind domain.Kind) error {
	return s.requireOwnInstance(ctx, tenantID, instanceID, userID, kind)
}

// reportPermissions are the two "or a general reports/attendance holder
// may look too" permission codes every RequireCanView* check falls back
// to (docs/analysis/backend-inventory.md 1.14/1.15/1.16), on top of the
// subject and the workflow's own relevant approver duties.
var reportPermissions = []string{"manage_attendance", "view_reports"}

// hasReportPermission is the shared fallback RequireCanViewLeaveRequest,
// RequireCanViewExitPermit and RequireCanViewLateArrival all use: a
// manage_attendance or view_reports holder (role- or duty-granted) may
// read any instance of the kind they are checking, on top of its own
// relevant approvers.
func (s *Service) hasReportPermission(ctx context.Context, tenantID, academicYearID, userID uuid.UUID, today time.Time) (bool, error) {
	for _, code := range reportPermissions {
		ok, err := s.repo.HasPermission(ctx, tenantID, academicYearID, userID, code, today)
		if err != nil {
			return false, err
		}
		if ok {
			return true, nil
		}
	}
	return false, nil
}

// RequireCanViewLeaveRequest allows the subject, the homeroom teacher of
// the request's class, counselors, leadership, and manage_attendance/
// view_reports holders to read a request's documents.
func (s *Service) RequireCanViewLeaveRequest(ctx context.Context, tenantID, instanceID, userID uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		inst, ok, err := s.repo.GetInstance(ctx, tenantID, instanceID)
		if err != nil {
			return err
		}
		if !ok || inst.Kind != domain.KindLeaveRequest {
			return domain.ErrInstanceNotFound
		}
		if inst.SubjectUserID == userID {
			return nil
		}
		today := s.tenantNow(ctx, tenantID)
		for _, slug := range []string{"homeroom", "counselor", "leadership"} {
			scope := uuid.NullUUID{}
			if slug == "homeroom" {
				scope = inst.ClassID
			}
			ok, err := s.repo.HasActiveDuty(ctx, tenantID, inst.AcademicYearID, userID, slug, scope, today)
			if err != nil {
				return err
			}
			if ok {
				return nil
			}
		}
		if ok, err := s.hasReportPermission(ctx, tenantID, inst.AcademicYearID, userID, today); err != nil {
			return err
		} else if ok {
			return nil
		}
		return domain.ErrNotWorkflowSubject
	})
}

// RequireCanViewExitPermit allows the subject, the homeroom teacher of the
// permit's class, counselors, leadership, security (scan_exit_permits),
// any active teacher (the duty_teacher/class_teacher stages' broad
// "any_teacher"/"teacher_of_class_now" rules approximated for viewing
// purposes), and manage_attendance/view_reports holders to read an exit
// permit's detail (docs/analysis/backend-inventory.md 1.15: was
// unrestricted to any authenticated user).
func (s *Service) RequireCanViewExitPermit(ctx context.Context, tenantID, instanceID, userID uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		inst, ok, err := s.repo.GetInstance(ctx, tenantID, instanceID)
		if err != nil {
			return err
		}
		if !ok || inst.Kind != domain.KindExitPermit {
			return domain.ErrInstanceNotFound
		}
		if inst.SubjectUserID == userID {
			return nil
		}
		today := s.tenantNow(ctx, tenantID)
		for _, slug := range []string{"homeroom", "counselor", "leadership", "security"} {
			scope := uuid.NullUUID{}
			if slug == "homeroom" {
				scope = inst.ClassID
			}
			ok, err := s.repo.HasActiveDuty(ctx, tenantID, inst.AcademicYearID, userID, slug, scope, today)
			if err != nil {
				return err
			}
			if ok {
				return nil
			}
		}
		if ok, err := s.repo.IsActiveTeacher(ctx, tenantID, userID); err != nil {
			return err
		} else if ok {
			return nil
		}
		if ok, err := s.hasReportPermission(ctx, tenantID, inst.AcademicYearID, userID, today); err != nil {
			return err
		} else if ok {
			return nil
		}
		return domain.ErrNotWorkflowSubject
	})
}

// RequireCanViewLateArrival allows the subject, the teacher whose token
// opened the flow, leadership, and manage_attendance/view_reports holders
// to read a late arrival's detail (docs/analysis/backend-inventory.md
// 1.16: was unrestricted to any authenticated user).
func (s *Service) RequireCanViewLateArrival(ctx context.Context, tenantID, instanceID, userID uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		inst, ok, err := s.repo.GetInstance(ctx, tenantID, instanceID)
		if err != nil {
			return err
		}
		if !ok || inst.Kind != domain.KindLateArrival {
			return domain.ErrInstanceNotFound
		}
		if inst.SubjectUserID == userID {
			return nil
		}
		late, ok, err := s.repo.GetLateArrival(ctx, tenantID, instanceID)
		if err != nil {
			return err
		}
		if ok && late.DutyTeacherUserID.Valid && late.DutyTeacherUserID.UUID == userID {
			return nil
		}
		today := s.tenantNow(ctx, tenantID)
		if ok, err := s.repo.HasActiveDuty(ctx, tenantID, inst.AcademicYearID, userID, "leadership", uuid.NullUUID{}, today); err != nil {
			return err
		} else if ok {
			return nil
		}
		if ok, err := s.hasReportPermission(ctx, tenantID, inst.AcademicYearID, userID, today); err != nil {
			return err
		} else if ok {
			return nil
		}
		return domain.ErrNotWorkflowSubject
	})
}

// LeaveOverride reports the attendance status an issued leave letter forces
// for the student on date (attendance.Overrider).
func (s *Service) LeaveOverride(ctx context.Context, tenantID, studentUserID uuid.UUID, date time.Time) (statusCode string, ok bool, err error) {
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		lr, found, err := s.repo.GetIssuedLeaveCoveringDate(ctx, tenantID, studentUserID, date)
		if err != nil || !found {
			return err
		}
		statusCode, ok = attendanceStatusFor(lr.Category), true
		return nil
	})
	return statusCode, ok, err
}
