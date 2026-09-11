package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
)

// BorrowInput is what the loan desk collects: the copy's barcode, who is
// borrowing it, and who is checking it out (a librarian or a kiosk actor).
type BorrowInput struct {
	Barcode      string
	MemberUserID uuid.UUID
	CheckedOutBy uuid.UUID
}

// Borrow issues a copy to a member. A copy already on loan cannot be
// borrowed again -- CanBorrow rejects it before any row is written.
func (s *Service) Borrow(ctx context.Context, tenantID uuid.UUID, in BorrowInput) (domain.Loan, error) {
	var loan domain.Loan
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		policy, err := s.loadPolicy(ctx, tenantID)
		if err != nil {
			return err
		}
		item, found, err := s.repo.GetCopyByBarcode(ctx, tenantID, in.Barcode)
		if err != nil {
			return err
		}
		if !found {
			return domain.ErrCopyNotFound
		}
		activeCount, err := s.repo.CountActiveLoansForMember(ctx, tenantID, in.MemberUserID)
		if err != nil {
			return err
		}
		if err := domain.CanBorrow(item, activeCount, policy); err != nil {
			return err
		}
		now := s.clock.Now()
		loan, err = s.repo.CreateLoan(ctx, domain.Loan{
			TenantID: tenantID, CopyID: item.ID, TitleID: item.TitleID, MemberUserID: in.MemberUserID,
			CheckedOutBy: in.CheckedOutBy, BorrowedAt: now, DueOn: policy.DueDate(now),
		})
		if err != nil {
			return err
		}
		_, err = s.repo.UpdateCopyStatus(ctx, tenantID, item.ID, domain.CopyOnLoan, nil)
		return err
	})
	return loan, err
}

// Return closes a loan, computes any overdue fine, frees the copy, and
// hands it straight to the next waiting reservation if one exists.
func (s *Service) Return(ctx context.Context, tenantID, loanID, checkedInBy uuid.UUID, condition *domain.CopyCondition) (domain.Loan, error) {
	var loan domain.Loan
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		existing, found, err := s.repo.GetLoan(ctx, tenantID, loanID)
		if err != nil {
			return err
		}
		if !found {
			return domain.ErrLoanNotFound
		}
		if existing.Status != domain.LoanActive {
			return domain.ErrLoanAlreadyReturned
		}
		policy, err := s.loadPolicy(ctx, tenantID)
		if err != nil {
			return err
		}
		now := s.clock.Now()
		fine := domain.CalculateFine(policy, existing.DueOn, now)
		loan, _, err = s.repo.ReturnLoan(ctx, tenantID, loanID, now, checkedInBy, fine)
		if err != nil {
			return err
		}
		return s.releaseCopyAfterReturn(ctx, tenantID, existing.CopyID, existing.TitleID, condition)
	})
	return loan, err
}

// releaseCopyAfterReturn puts a returned copy back into circulation: if a
// member is waiting for the title it goes straight to them (status
// reserved, held for the policy's hold window), otherwise it becomes
// available again.
func (s *Service) releaseCopyAfterReturn(ctx context.Context, tenantID, copyID, titleID uuid.UUID, condition *domain.CopyCondition) error {
	waiting, err := s.repo.ListReservationsForTitle(ctx, tenantID, titleID)
	if err != nil {
		return err
	}
	next, hasNext := domain.NextWaiting(waiting)
	if !hasNext {
		_, err := s.repo.UpdateCopyStatus(ctx, tenantID, copyID, domain.CopyAvailable, condition)
		return err
	}
	if _, err := s.repo.UpdateCopyStatus(ctx, tenantID, copyID, domain.CopyReserved, condition); err != nil {
		return err
	}
	policy, err := s.loadPolicy(ctx, tenantID)
	if err != nil {
		return err
	}
	now := s.clock.Now()
	_, _, err = s.repo.MarkReservationReady(ctx, tenantID, next.ID, now, now.AddDate(0, 0, policy.ReservationHoldDays))
	return err
}

// Renew extends a loan's due date. It is refused for a loan already at its
// renewal limit, one that is overdue, or one whose title has a member
// waiting in the reservation queue.
func (s *Service) Renew(ctx context.Context, tenantID, loanID uuid.UUID) (domain.Loan, error) {
	var loan domain.Loan
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		existing, found, err := s.repo.GetLoan(ctx, tenantID, loanID)
		if err != nil {
			return err
		}
		if !found {
			return domain.ErrLoanNotFound
		}
		policy, err := s.loadPolicy(ctx, tenantID)
		if err != nil {
			return err
		}
		waiting, err := s.repo.ListReservationsForTitle(ctx, tenantID, existing.TitleID)
		if err != nil {
			return err
		}
		_, hasWaiting := domain.NextWaiting(waiting)
		now := s.clock.Now()
		if err := domain.CanRenew(existing, policy, now, hasWaiting); err != nil {
			return err
		}
		loan, _, err = s.repo.RenewLoan(ctx, tenantID, loanID, policy.RenewedDueDate(now))
		return err
	})
	return loan, err
}

// MarkLost closes a loan as lost and charges the copy's condition instead
// of a per-day fine; callers pass the replacement cost as fineAmount.
func (s *Service) MarkLost(ctx context.Context, tenantID, loanID, checkedInBy uuid.UUID, replacementCost int) (domain.Loan, error) {
	var loan domain.Loan
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		existing, found, err := s.repo.GetLoan(ctx, tenantID, loanID)
		if err != nil {
			return err
		}
		if !found {
			return domain.ErrLoanNotFound
		}
		if existing.Status != domain.LoanActive {
			return domain.ErrLoanAlreadyReturned
		}
		now := s.clock.Now()
		loan, _, err = s.repo.MarkLoanLost(ctx, tenantID, loanID, now, checkedInBy, replacementCost)
		if err != nil {
			return err
		}
		lost := domain.ConditionLost
		_, err = s.repo.UpdateCopyStatus(ctx, tenantID, existing.CopyID, domain.CopyLost, &lost)
		return err
	})
	return loan, err
}

func (s *Service) MemberLoanHistory(ctx context.Context, tenantID, memberID uuid.UUID, includeReturned bool, limit, offset int) ([]domain.Loan, error) {
	return s.repo.ListLoansForMember(ctx, tenantID, memberID, includeReturned, clampLimit(limit), offset)
}

func (s *Service) OverdueLoans(ctx context.Context, tenantID uuid.UUID) ([]domain.Loan, error) {
	return s.repo.ListOverdueLoans(ctx, tenantID, s.clock.Now())
}
