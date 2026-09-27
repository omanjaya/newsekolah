package service

import (
	"context"

	"github.com/google/uuid"
)

const (
	dutySlugCounselor  = "counselor"
	dutySlugLeadership = "leadership"
)

// ListAtRiskStudents returns the stored results the caller may see: a
// counselor or school leadership (duty slugs "counselor"/"leadership",
// the same ones discipline's counseling visibility already uses), or a
// caller holding one of the admin/super_admin/principal system roles
// (isOverseer -- resolved by the transport layer from
// authz.IdentityFromContext, the same role check transport/http/
// dashboard.go's isAdminCaller already makes for the admin dashboard) sees
// every class. Everyone else must hold the homeroom duty for a class and
// sees only that class's roster. There is no class_id parameter, mirroring
// attendance's GetHomeroomAttendance: this is always the caller's own
// scope, never a class they merely ask to view.
func (s *Service) ListAtRiskStudents(ctx context.Context, tenantID, actorUserID uuid.UUID, isOverseer bool) ([]StoredResult, error) {
	var out []StoredResult
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		scope, err := s.resolveScope(ctx, tenantID, yearID, actorUserID, isOverseer)
		if err != nil {
			return err
		}
		out, err = s.repo.ListResults(ctx, tenantID, yearID, scope)
		return err
	})
	return out, err
}

// GetStudentRisk returns one student's stored result, if the caller's
// scope (see ListAtRiskStudents, including the isOverseer bypass) covers
// that student's class.
func (s *Service) GetStudentRisk(ctx context.Context, tenantID, actorUserID, studentID uuid.UUID, isOverseer bool) (StoredResult, error) {
	var out StoredResult
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		scope, err := s.resolveScope(ctx, tenantID, yearID, actorUserID, isOverseer)
		if err != nil {
			return err
		}
		result, found, err := s.repo.GetResult(ctx, tenantID, yearID, studentID)
		if err != nil {
			return err
		}
		if !found {
			return ErrResultNotFound
		}
		if scope.Valid && (!result.ClassID.Valid || result.ClassID.UUID != scope.UUID) {
			return ErrResultNotFound // scoped out, reported the same as not found
		}
		out = result
		return nil
	})
	return out, err
}

// resolveScope returns the class the caller is limited to, or an invalid
// uuid.NullUUID for "every class": counselor/leadership duty holders and
// isOverseer callers (admin/super_admin/principal, see ListAtRiskStudents)
// both get school-wide scope. Anyone else must be the homeroom teacher of
// some class.
func (s *Service) resolveScope(ctx context.Context, tenantID, yearID, actorUserID uuid.UUID, isOverseer bool) (uuid.NullUUID, error) {
	if isOverseer {
		return uuid.NullUUID{}, nil
	}
	isCounselor, err := s.repo.HasActiveDuty(ctx, tenantID, yearID, actorUserID, dutySlugCounselor)
	if err != nil {
		return uuid.NullUUID{}, err
	}
	if isCounselor {
		return uuid.NullUUID{}, nil
	}
	isLeadership, err := s.repo.HasActiveDuty(ctx, tenantID, yearID, actorUserID, dutySlugLeadership)
	if err != nil {
		return uuid.NullUUID{}, err
	}
	if isLeadership {
		return uuid.NullUUID{}, nil
	}
	classID, err := s.repo.GetHomeroomClassID(ctx, tenantID, yearID, actorUserID)
	if err != nil {
		return uuid.NullUUID{}, err
	}
	if !classID.Valid {
		return uuid.NullUUID{}, ErrNotHomeroomTeacher
	}
	return classID, nil
}
