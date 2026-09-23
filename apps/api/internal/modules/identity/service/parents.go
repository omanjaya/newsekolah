package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
)

// Child is one student a parent account is linked to, with the class the
// parent's screens label them by.
type Child struct {
	StudentUserID   uuid.UUID
	StudentName     string
	ClassID         uuid.NullUUID
	ClassName       string
	Relation        string
	CanApproveLeave bool
}

// Guardian is one parent linked to a student, for the school's own view.
type Guardian struct {
	ParentUserID    uuid.UUID
	ParentName      string
	Phone           string
	Relation        string
	CanApproveLeave bool
}

// ParentsRepository is the parent-student slice of the repository.
type ParentsRepository interface {
	LinkParentStudent(ctx context.Context, tenantID, parentID, studentID uuid.UUID, relation string, canApproveLeave bool) error
	UnlinkParentStudent(ctx context.Context, tenantID, parentID, studentID uuid.UUID) error
	ListChildren(ctx context.Context, tenantID, parentID uuid.UUID, yearID uuid.NullUUID) ([]Child, error)
	ListGuardians(ctx context.Context, tenantID, studentID uuid.UUID) ([]Guardian, error)
	IsParentOf(ctx context.Context, tenantID, parentID, studentID uuid.UUID) (bool, error)
	ActiveClassForStudent(ctx context.Context, tenantID, studentID, yearID uuid.UUID) (ClassRef, bool, error)
}

// ClassRef names a class without pulling in the academic module's types.
type ClassRef struct {
	ID   uuid.UUID
	Name string
}

func validRelation(relation string) bool {
	switch relation {
	case "father", "mother", "guardian":
		return true
	}
	return false
}

// LinkChild connects a parent account to a student. Both must exist in
// this tenant and hold the matching profile kind, so a link can never
// point at the wrong kind of account.
func (s *Service) LinkChild(ctx context.Context, tenantID, parentID, studentID uuid.UUID, relation string, canApproveLeave bool) error {
	if !validRelation(relation) {
		return domain.ErrInvalidRelation
	}
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		parent, err := s.repo.GetUserAdminByID(ctx, tenantID, parentID)
		if err != nil {
			return err
		}
		student, err := s.repo.GetUserAdminByID(ctx, tenantID, studentID)
		if err != nil {
			return err
		}
		if parent.ProfileKind != domain.ProfileParent || student.ProfileKind != domain.ProfileStudent {
			return domain.ErrInvalidRelation
		}
		return s.repo.LinkParentStudent(ctx, tenantID, parentID, studentID, relation, canApproveLeave)
	})
}

func (s *Service) UnlinkChild(ctx context.Context, tenantID, parentID, studentID uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.UnlinkParentStudent(ctx, tenantID, parentID, studentID)
	})
}

// MyChildren is what a signed-in parent sees.
func (s *Service) MyChildren(ctx context.Context, tenantID, parentID uuid.UUID) ([]Child, error) {
	var out []Child
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID := uuid.NullUUID{}
		if id, ok, err := s.years.GetActiveAcademicYearID(ctx, tenantID); err != nil {
			return err
		} else if ok {
			yearID = uuid.NullUUID{UUID: id, Valid: true}
		}
		var err error
		out, err = s.repo.ListChildren(ctx, tenantID, parentID, yearID)
		return err
	})
	return out, err
}

func (s *Service) GuardiansOf(ctx context.Context, tenantID, studentID uuid.UUID) ([]Guardian, error) {
	var out []Guardian
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListGuardians(ctx, tenantID, studentID)
		return err
	})
	return out, err
}

// IsParentOf gates every per-child read; the caller must be linked.
func (s *Service) IsParentOf(ctx context.Context, tenantID, parentID, studentID uuid.UUID) (bool, error) {
	var ok bool
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		ok, err = s.repo.IsParentOf(ctx, tenantID, parentID, studentID)
		return err
	})
	return ok, err
}
