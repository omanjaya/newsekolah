package service

import (
	"context"
	"errors"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/billing/domain"
)

// ErrNotLinked mirrors family/service.ErrNotLinked: a parent asking about
// a child they are not linked to gets the same refusal family's own
// endpoints give, mapped to the same FORBIDDEN response.
var ErrNotLinked = errors.New("not a guardian of this student")

func (s *Service) ListBills(ctx context.Context, tenantID uuid.UUID, f BillFilter) ([]domain.Bill, error) {
	if err := s.guard(ctx, tenantID); err != nil {
		return nil, err
	}
	if f.Limit <= 0 || f.Limit > 200 {
		f.Limit = 50
	}
	var out []domain.Bill
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		out, err = s.repo.ListBills(ctx, tenantID, yearID, f)
		return err
	})
	return out, err
}

func (s *Service) GetBill(ctx context.Context, tenantID, id uuid.UUID) (domain.Bill, error) {
	if err := s.guard(ctx, tenantID); err != nil {
		return domain.Bill{}, err
	}
	var out domain.Bill
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		bill, ok, err := s.repo.GetBill(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrBillNotFound
		}
		out = bill
		return nil
	})
	return out, err
}

// StudentHistory is one student's full billing picture: every bill this
// year, plus the non-voided payments recorded against each.
type StudentHistory struct {
	Bills    []domain.Bill
	Payments map[uuid.UUID][]domain.Payment
}

func (s *Service) StudentBillHistory(ctx context.Context, tenantID, studentID uuid.UUID) (StudentHistory, error) {
	if err := s.guard(ctx, tenantID); err != nil {
		return StudentHistory{}, err
	}
	out := StudentHistory{Payments: map[uuid.UUID][]domain.Payment{}}
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		out.Bills, err = s.repo.ListBillsForStudent(ctx, tenantID, yearID, studentID)
		if err != nil {
			return err
		}
		for _, b := range out.Bills {
			payments, err := s.repo.ListPaymentsForBill(ctx, tenantID, b.ID)
			if err != nil {
				return err
			}
			out.Payments[b.ID] = payments
		}
		return nil
	})
	return out, err
}

// ChildBillHistory is the read-only view a parent reaches through the
// family screens: the same StudentBillHistory a staff member sees, after
// proving the caller is actually linked to this student.
func (s *Service) ChildBillHistory(ctx context.Context, tenantID, parentUserID, studentID uuid.UUID) (StudentHistory, error) {
	if s.links == nil {
		return StudentHistory{}, ErrNotLinked
	}
	ok, err := s.links.IsParentOf(ctx, tenantID, parentUserID, studentID)
	if err != nil {
		return StudentHistory{}, err
	}
	if !ok {
		return StudentHistory{}, ErrNotLinked
	}
	return s.StudentBillHistory(ctx, tenantID, studentID)
}
