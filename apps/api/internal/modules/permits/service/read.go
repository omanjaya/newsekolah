package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
)

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

// RequireCanViewLeaveRequest allows the subject, the homeroom teacher of
// the request's class, and counselors to read a request's documents.
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
		for _, slug := range []string{"homeroom", "counselor", "leadership"} {
			scope := uuid.NullUUID{}
			if slug == "homeroom" {
				scope = inst.ClassID
			}
			ok, err := s.repo.HasActiveDuty(ctx, tenantID, inst.AcademicYearID, userID, slug, scope)
			if err != nil {
				return err
			}
			if ok {
				return nil
			}
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
