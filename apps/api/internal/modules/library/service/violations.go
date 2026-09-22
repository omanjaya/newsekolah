package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
)

// CreateViolationInput is a manual violation record (old app:
// library_circulation.go:1530-1678 manual create): damage found at a
// stocktake, a note against a member for something other than a loan.
type CreateViolationInput struct {
	MemberUserID uuid.UUID
	LoanID       uuid.NullUUID
	Kind         domain.ViolationKind
	Penalty      domain.Penalty
	Amount       int
	SuspendDays  int
	Notes        string
	CreatedBy    uuid.UUID
}

func (s *Service) CreateViolation(ctx context.Context, tenantID uuid.UUID, in CreateViolationInput) (domain.Violation, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return domain.Violation{}, err
	}
	if !in.Kind.Valid() || !in.Penalty.Valid() {
		return domain.Violation{}, domain.ErrInvalidInput
	}
	var violation domain.Violation
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		violation, err = s.repo.CreateViolation(ctx, domain.Violation{
			TenantID: tenantID, LoanID: in.LoanID, MemberUserID: in.MemberUserID, Kind: in.Kind, Penalty: in.Penalty,
			Amount: in.Amount, SuspendDays: in.SuspendDays, Status: domain.ViolationUnpaid, Notes: in.Notes, CreatedBy: in.CreatedBy,
		})
		if err != nil {
			return err
		}
		if in.Kind == domain.ViolationDamaged {
			if loan, found, err := s.repo.GetLoan(ctx, tenantID, ifValid(in.LoanID)); err == nil && found {
				damaged := domain.ConditionDamaged
				if _, err := s.repo.UpdateCopyStatus(ctx, tenantID, loan.CopyID, domain.CopyAvailable, &damaged); err != nil {
					return err
				}
			}
		}
		if in.Penalty == domain.PenaltySuspend && in.SuspendDays > 0 {
			suspendedUntil := nullableDatePtr(s.clock.Now().AddDate(0, 0, in.SuspendDays))
			_, _, err = s.repo.UpdateMemberStatus(ctx, tenantID, in.MemberUserID, domain.MemberSuspended, suspendedUntil)
		}
		return err
	})
	return violation, err
}

func ifValid(id uuid.NullUUID) uuid.UUID {
	if id.Valid {
		return id.UUID
	}
	return uuid.Nil
}

func (s *Service) ListViolationsForMember(ctx context.Context, tenantID, memberID uuid.UUID) ([]domain.Violation, error) {
	var violations []domain.Violation
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		violations, err = s.repo.ListViolationsForMember(ctx, tenantID, memberID)
		return err
	})
	return violations, err
}

func (s *Service) ListViolations(ctx context.Context, tenantID uuid.UUID, status, kind string, limit, offset int) ([]domain.Violation, error) {
	var violations []domain.Violation
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		violations, err = s.repo.ListViolations(ctx, tenantID, status, kind, clampLimit(limit), offset)
		return err
	})
	return violations, err
}

// SettleViolation marks a violation paid or waived. If the member's
// suspension was the reason for the violation and every other unpaid
// violation is clear and the suspension window has passed, the member is
// reactivated -- old app: library_circulation.go settle "bila semua lunas
// + suspend sudah lewat -> anggota aktif".
func (s *Service) SettleViolation(ctx context.Context, tenantID, id uuid.UUID, status domain.ViolationStatus, settledBy uuid.UUID) (domain.Violation, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return domain.Violation{}, err
	}
	if status != domain.ViolationPaid && status != domain.ViolationWaived {
		return domain.Violation{}, domain.ErrInvalidInput
	}
	var violation domain.Violation
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		now := s.clock.Now()
		var found bool
		var err error
		violation, found, err = s.repo.SettleViolation(ctx, tenantID, id, status, now, settledBy)
		if err != nil {
			return err
		}
		if !found {
			return domain.ErrViolationAlreadySettled
		}
		member, memberFound, err := s.repo.GetMember(ctx, tenantID, violation.MemberUserID)
		if err != nil || !memberFound || member.Status != domain.MemberSuspended {
			return err
		}
		if member.SuspendedUntil != nil && now.Before(*member.SuspendedUntil) {
			return nil
		}
		remaining, err := s.repo.CountUnpaidViolations(ctx, tenantID, member.UserID)
		if err != nil || remaining > 0 {
			return err
		}
		_, _, err = s.repo.UpdateMemberStatus(ctx, tenantID, member.UserID, domain.MemberActive, nil)
		return err
	})
	return violation, err
}
