package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/audit"
)

// DutyTypeRecord is one duty_types row.
type DutyTypeRecord struct {
	ID        uuid.UUID
	Slug      string
	Name      string
	ScopeKind domain.DutyScopeKind
	IsActive  bool
}

// DutyTypeView adds the permission codes duty_permissions grants for this
// duty type.
type DutyTypeView struct {
	DutyTypeRecord
	Permissions []string
}

// DutyAssignmentRecord is one duty_assignments row, with the owning duty
// type's slug/name joined in for display.
type DutyAssignmentRecord struct {
	ID             uuid.UUID
	AcademicYearID uuid.UUID
	DutyTypeID     uuid.UUID
	DutySlug       string
	DutyName       string
	UserID         uuid.UUID
	ScopeClassID   uuid.NullUUID
	ScopeStudentID uuid.NullUUID
	IsActive       bool
	StartsOn       time.Time
	EndsOn         *time.Time
}

// DutiesRepository is the data-access boundary for duty type and duty
// assignment administration (docs/06-database-schema.md section 3).
type DutiesRepository interface {
	ListDutyTypes(ctx context.Context, tenantID uuid.UUID, includeInactive bool) ([]DutyTypeRecord, error)
	GetDutyTypeByID(ctx context.Context, tenantID, id uuid.UUID) (DutyTypeRecord, error)
	CreateDutyTypeRecord(ctx context.Context, tenantID uuid.UUID, slug, name string, scope domain.DutyScopeKind) (DutyTypeRecord, error)
	UpdateDutyTypeRecord(ctx context.Context, tenantID, id uuid.UUID, name string, scope domain.DutyScopeKind, isActive bool) error
	SoftDeleteDutyType(ctx context.Context, tenantID, id uuid.UUID) error
	CountAssignmentsForDutyType(ctx context.Context, tenantID, id uuid.UUID) (int64, error)
	DeleteDutyPermissions(ctx context.Context, tenantID, id uuid.UUID) error
	AddDutyPermissionRecord(ctx context.Context, tenantID, id uuid.UUID, code string) error
	ListDutyPermissionCodes(ctx context.Context, tenantID, id uuid.UUID) ([]string, error)

	ListDutyAssignments(ctx context.Context, tenantID, academicYearID uuid.UUID, dutyTypeID, userID uuid.NullUUID) ([]DutyAssignmentRecord, error)
	GetDutyAssignmentByID(ctx context.Context, tenantID, id uuid.UUID) (DutyAssignmentRecord, error)
	CreateDutyAssignmentRecord(ctx context.Context, tenantID uuid.UUID, in DutyAssignmentRecord) (DutyAssignmentRecord, error)
	UpdateDutyAssignmentRecord(ctx context.Context, tenantID, id uuid.UUID, isActive bool, endsOn *time.Time) error
	DeleteDutyAssignmentRecord(ctx context.Context, tenantID, id uuid.UUID) error

	ClassExists(ctx context.Context, tenantID, classID uuid.UUID) (bool, error)
	UserExists(ctx context.Context, tenantID, userID uuid.UUID) (bool, error)
}

// ListDutyTypes returns every duty type for the tenant.
func (s *Service) ListDutyTypes(ctx context.Context, tenantID uuid.UUID, includeInactive bool) ([]DutyTypeView, error) {
	var views []DutyTypeView
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		types, err := s.repo.ListDutyTypes(ctx, tenantID, includeInactive)
		if err != nil {
			return fmt.Errorf("list duty types: %w", err)
		}
		views = make([]DutyTypeView, len(types))
		for i, t := range types {
			perms, err := s.repo.ListDutyPermissionCodes(ctx, tenantID, t.ID)
			if err != nil {
				return fmt.Errorf("list permissions for duty type %s: %w", t.ID, err)
			}
			views[i] = DutyTypeView{DutyTypeRecord: t, Permissions: perms}
		}
		return nil
	})
	return views, err
}

// CreateDutyType creates a duty type (e.g. homeroom, counselor, picket).
func (s *Service) CreateDutyType(ctx context.Context, tenantID uuid.UUID, slug, name string, scope domain.DutyScopeKind) (DutyTypeView, error) {
	if err := domain.ValidateDutyType(slug, name, scope); err != nil {
		return DutyTypeView{}, err
	}
	var view DutyTypeView
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		t, err := s.repo.CreateDutyTypeRecord(ctx, tenantID, slug, name, scope)
		if err != nil {
			return fmt.Errorf("create duty type: %w", err)
		}
		if err := audit.Record(ctx, tenantID, "duty_type.create", "duty_type", t.ID, nil, t); err != nil {
			return err
		}
		view = DutyTypeView{DutyTypeRecord: t}
		return nil
	})
	return view, err
}

// UpdateDutyType updates a duty type's name, scope kind, and active flag.
// Its slug is immutable once created (duty_permissions and duty_assignments
// reference it by ID, not slug, but the slug is what code and reports key
// off of, so changing it silently would be confusing, not unsafe).
func (s *Service) UpdateDutyType(ctx context.Context, tenantID, id uuid.UUID, name string, scope domain.DutyScopeKind, isActive bool) (DutyTypeView, error) {
	var view DutyTypeView
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		before, err := s.repo.GetDutyTypeByID(ctx, tenantID, id)
		if err != nil {
			return domain.ErrDutyTypeNotFound
		}
		if err := domain.ValidateDutyType(before.Slug, name, scope); err != nil {
			return err
		}
		if err := s.repo.UpdateDutyTypeRecord(ctx, tenantID, id, name, scope, isActive); err != nil {
			return fmt.Errorf("update duty type: %w", err)
		}
		after := DutyTypeRecord{ID: id, Slug: before.Slug, Name: name, ScopeKind: scope, IsActive: isActive}
		if err := audit.Record(ctx, tenantID, "duty_type.update", "duty_type", id, before, after); err != nil {
			return err
		}
		view = DutyTypeView{DutyTypeRecord: after}
		return nil
	})
	return view, err
}

// DeleteDutyType soft-deletes a duty type, refusing one still assigned to
// anyone.
func (s *Service) DeleteDutyType(ctx context.Context, tenantID, id uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		before, err := s.repo.GetDutyTypeByID(ctx, tenantID, id)
		if err != nil {
			return domain.ErrDutyTypeNotFound
		}
		count, err := s.repo.CountAssignmentsForDutyType(ctx, tenantID, id)
		if err != nil {
			return fmt.Errorf("count assignments: %w", err)
		}
		if count > 0 {
			return domain.ErrDutyTypeInUse
		}
		if err := s.repo.SoftDeleteDutyType(ctx, tenantID, id); err != nil {
			return fmt.Errorf("delete duty type: %w", err)
		}
		return audit.Record(ctx, tenantID, "duty_type.delete", "duty_type", id, before, nil)
	})
}

// ReplaceDutyPermissions replaces the permission codes duty type id grants
// while active.
func (s *Service) ReplaceDutyPermissions(ctx context.Context, tenantID, id uuid.UUID, codes []string) (DutyTypeView, error) {
	known := knownPermissionSet()
	for _, c := range codes {
		if !known.Has(c) {
			return DutyTypeView{}, domain.ErrUnknownPermission
		}
	}

	var view DutyTypeView
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		t, err := s.repo.GetDutyTypeByID(ctx, tenantID, id)
		if err != nil {
			return domain.ErrDutyTypeNotFound
		}
		before, err := s.repo.ListDutyPermissionCodes(ctx, tenantID, id)
		if err != nil {
			return fmt.Errorf("list current duty permissions: %w", err)
		}
		if err := s.repo.DeleteDutyPermissions(ctx, tenantID, id); err != nil {
			return fmt.Errorf("clear duty permissions: %w", err)
		}
		for _, code := range codes {
			if err := s.repo.AddDutyPermissionRecord(ctx, tenantID, id, code); err != nil {
				return fmt.Errorf("grant duty permission %s: %w", code, err)
			}
		}
		if err := audit.Record(ctx, tenantID, "duty_type.replace_permissions", "duty_type", id, before, codes); err != nil {
			return err
		}
		view = DutyTypeView{DutyTypeRecord: t, Permissions: codes}
		return nil
	})
	return view, err
}
