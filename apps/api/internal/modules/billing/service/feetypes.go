package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/billing/domain"
)

func (s *Service) ListFeeTypes(ctx context.Context, tenantID uuid.UUID, includeInactive bool) ([]domain.FeeType, error) {
	if err := s.guard(ctx, tenantID); err != nil {
		return nil, err
	}
	var out []domain.FeeType
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		out, err = s.repo.ListFeeTypes(ctx, tenantID, yearID, includeInactive)
		return err
	})
	return out, err
}

func (s *Service) GetFeeType(ctx context.Context, tenantID, id uuid.UUID) (domain.FeeType, error) {
	if err := s.guard(ctx, tenantID); err != nil {
		return domain.FeeType{}, err
	}
	var out domain.FeeType
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		t, ok, err := s.repo.GetFeeType(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrFeeTypeNotFound
		}
		out = t
		return nil
	})
	return out, err
}

func (s *Service) CreateFeeType(ctx context.Context, t domain.FeeType, actorUserID uuid.UUID) (domain.FeeType, error) {
	if err := s.guard(ctx, t.TenantID); err != nil {
		return domain.FeeType{}, err
	}
	t.Normalize()
	if err := t.Validate(); err != nil {
		return domain.FeeType{}, err
	}
	t.IsActive = true
	t.CreatedBy = uuid.NullUUID{UUID: actorUserID, Valid: true}
	t.UpdatedBy = t.CreatedBy
	var out domain.FeeType
	err := s.withTx(ctx, t.TenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, t.TenantID)
		if err != nil {
			return err
		}
		t.AcademicYearID = yearID
		out, err = s.repo.CreateFeeType(ctx, t)
		return err
	})
	return out, err
}

func (s *Service) UpdateFeeType(ctx context.Context, t domain.FeeType, actorUserID uuid.UUID) (domain.FeeType, error) {
	if err := s.guard(ctx, t.TenantID); err != nil {
		return domain.FeeType{}, err
	}
	t.Normalize()
	if err := t.Validate(); err != nil {
		return domain.FeeType{}, err
	}
	t.UpdatedBy = uuid.NullUUID{UUID: actorUserID, Valid: true}
	var out domain.FeeType
	err := s.withTx(ctx, t.TenantID, func(ctx context.Context) error {
		current, ok, err := s.repo.GetFeeType(ctx, t.TenantID, t.ID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrFeeTypeNotFound
		}
		t.AcademicYearID = current.AcademicYearID
		out, err = s.repo.UpdateFeeType(ctx, t)
		return err
	})
	return out, err
}

// DeleteFeeType retires a fee type (soft delete): bills already generated
// from it keep their own snapshot of the name and amount, so retiring it
// never rewrites history.
func (s *Service) DeleteFeeType(ctx context.Context, tenantID, id uuid.UUID) error {
	if err := s.guard(ctx, tenantID); err != nil {
		return err
	}
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.DeleteFeeType(ctx, tenantID, id)
	})
}

// Discounts.

func (s *Service) ListDiscountsForFeeType(ctx context.Context, tenantID, feeTypeID uuid.UUID) ([]domain.Discount, error) {
	if err := s.guard(ctx, tenantID); err != nil {
		return nil, err
	}
	var out []domain.Discount
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListDiscountsForFeeType(ctx, tenantID, feeTypeID)
		return err
	})
	return out, err
}

func (s *Service) ListDiscountsForStudent(ctx context.Context, tenantID, studentID uuid.UUID) ([]domain.Discount, error) {
	if err := s.guard(ctx, tenantID); err != nil {
		return nil, err
	}
	var out []domain.Discount
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListDiscountsForStudent(ctx, tenantID, studentID)
		return err
	})
	return out, err
}

func (s *Service) CreateDiscount(ctx context.Context, d domain.Discount, actorUserID uuid.UUID) (domain.Discount, error) {
	if err := s.guard(ctx, d.TenantID); err != nil {
		return domain.Discount{}, err
	}
	d.Normalize()
	if err := d.Validate(); err != nil {
		return domain.Discount{}, err
	}
	d.IsActive = true
	d.CreatedByUserID = uuid.NullUUID{UUID: actorUserID, Valid: true}
	var out domain.Discount
	err := s.withTx(ctx, d.TenantID, func(ctx context.Context) error {
		if _, ok, err := s.repo.GetFeeType(ctx, d.TenantID, d.FeeTypeID); err != nil {
			return err
		} else if !ok {
			return domain.ErrFeeTypeNotFound
		}
		var err error
		out, err = s.repo.CreateDiscount(ctx, d)
		return err
	})
	return out, err
}

func (s *Service) UpdateDiscount(ctx context.Context, d domain.Discount) (domain.Discount, error) {
	if err := s.guard(ctx, d.TenantID); err != nil {
		return domain.Discount{}, err
	}
	d.Normalize()
	if err := d.Validate(); err != nil {
		return domain.Discount{}, err
	}
	var out domain.Discount
	err := s.withTx(ctx, d.TenantID, func(ctx context.Context) error {
		current, ok, err := s.repo.GetDiscount(ctx, d.TenantID, d.ID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrDiscountNotFound
		}
		d.FeeTypeID, d.StudentUserID = current.FeeTypeID, current.StudentUserID
		out, err = s.repo.UpdateDiscount(ctx, d)
		return err
	})
	return out, err
}

func (s *Service) DeleteDiscount(ctx context.Context, tenantID, id uuid.UUID) error {
	if err := s.guard(ctx, tenantID); err != nil {
		return err
	}
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.DeleteDiscount(ctx, tenantID, id)
	})
}
