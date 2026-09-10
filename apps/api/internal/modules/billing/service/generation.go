package service

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/billing/domain"
)

// GenerationSummary is what the caller sees back from a preview or an
// actual run: how many bills were (or would be) created, their total
// value, and how many candidates were already billed and therefore
// skipped.
type GenerationSummary struct {
	Created []domain.Bill
	Skipped int
}

// PreviewGeneration computes what GenerateBills would create for period
// without writing anything, so an administrator can review the list
// before committing to it.
func (s *Service) PreviewGeneration(ctx context.Context, tenantID uuid.UUID, period string) (GenerationSummary, error) {
	if err := s.guard(ctx, tenantID); err != nil {
		return GenerationSummary{}, err
	}
	var summary GenerationSummary
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		plan, dueDate, yearID, err := s.plan(ctx, tenantID, period)
		if err != nil {
			return err
		}
		summary.Created = candidatesToBills(plan, tenantID, yearID, dueDate, uuid.NullUUID{})
		return nil
	})
	return summary, err
}

// GenerateBills runs the same plan as PreviewGeneration and persists it.
// The unique index on (tenant_id, fee_type_id, student_user_id, period)
// backs the idempotency PlanGeneration already provides: even a
// concurrent second call cannot create a duplicate bill.
func (s *Service) GenerateBills(ctx context.Context, tenantID, actorUserID uuid.UUID, period string) (GenerationSummary, error) {
	if err := s.guard(ctx, tenantID); err != nil {
		return GenerationSummary{}, err
	}
	var summary GenerationSummary
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		plan, dueDate, yearID, err := s.plan(ctx, tenantID, period)
		if err != nil {
			return err
		}
		if len(plan) == 0 {
			return nil
		}
		toInsert := candidatesToBills(plan, tenantID, yearID, dueDate, uuid.NullUUID{UUID: actorUserID, Valid: true})
		created, err := s.repo.CreateBills(ctx, toInsert)
		if err != nil {
			return err
		}
		summary.Created = created
		summary.Skipped = len(toInsert) - len(created)
		return nil
	})
	return summary, err
}

// plan loads the fee types, active enrollments, applicable discounts and
// already-billed keys for period, then hands them to the pure
// domain.PlanGeneration so both preview and generate compute the exact
// same candidates.
func (s *Service) plan(ctx context.Context, tenantID uuid.UUID, period string) ([]domain.BillCandidate, time.Time, uuid.UUID, error) {
	period = strings.TrimSpace(period)
	if period == "" {
		return nil, time.Time{}, uuid.Nil, domain.ErrInvalidInput
	}
	yearID, err := s.activeYear(ctx, tenantID)
	if err != nil {
		return nil, time.Time{}, uuid.Nil, err
	}
	feeTypes, err := s.repo.ListActiveFeeTypes(ctx, tenantID, yearID)
	if err != nil {
		return nil, time.Time{}, uuid.Nil, err
	}
	if len(feeTypes) == 0 {
		return nil, time.Time{}, yearID, nil
	}
	students, err := s.repo.ListActiveEnrollments(ctx, tenantID, yearID)
	if err != nil {
		return nil, time.Time{}, uuid.Nil, err
	}
	feeTypeIDs := make([]uuid.UUID, len(feeTypes))
	for i, ft := range feeTypes {
		feeTypeIDs[i] = ft.ID
	}
	discountRows, err := s.repo.ListActiveDiscounts(ctx, tenantID, feeTypeIDs)
	if err != nil {
		return nil, time.Time{}, uuid.Nil, err
	}
	discounts := make(map[domain.FeeStudentKey]domain.Discount, len(discountRows))
	for _, d := range discountRows {
		discounts[domain.FeeStudentKey{FeeTypeID: d.FeeTypeID, StudentUserID: d.StudentUserID}] = d
	}
	existing, err := s.repo.ExistingBillKeys(ctx, tenantID, feeTypeIDs, period)
	if err != nil {
		return nil, time.Time{}, uuid.Nil, err
	}
	dueDate := s.clock.Now().AddDate(0, 0, 10)
	return domain.PlanGeneration(feeTypes, students, period, discounts, existing), dueDate, yearID, nil
}

func candidatesToBills(plan []domain.BillCandidate, tenantID, yearID uuid.UUID, dueDate time.Time, generatedBy uuid.NullUUID) []domain.Bill {
	out := make([]domain.Bill, len(plan))
	for i, c := range plan {
		out[i] = domain.Bill{
			ID: newID(), TenantID: tenantID, AcademicYearID: yearID, StudentUserID: c.StudentUserID,
			FeeTypeID: c.FeeType.ID, FeeTypeName: c.FeeType.Name, Currency: c.FeeType.Currency, Period: c.Key.Period, DueDate: dueDate,
			OriginalAmountMinor: c.OriginalAmountMinor, DiscountAmountMinor: c.DiscountAmountMinor, AmountMinor: c.AmountMinor,
			Status: domain.StatusFor(c.AmountMinor, 0), GeneratedBy: generatedBy,
		}
	}
	return out
}
