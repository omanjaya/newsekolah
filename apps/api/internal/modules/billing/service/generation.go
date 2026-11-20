package service

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/billing/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/audit"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

// GenerationSummary is what the caller sees back from a preview or an
// actual run: the bills that were (or would be) created, and how many
// candidates were already billed (for the requested month, or for a
// one-off fee type's own period) and therefore skipped.
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
		summary.Created = candidatesToBills(plan.Candidates, tenantID, yearID, dueDate, uuid.NullUUID{})
		summary.Skipped = plan.AlreadyBilled
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
		summary.Skipped = plan.AlreadyBilled
		if len(plan.Candidates) == 0 {
			return nil
		}
		toInsert := candidatesToBills(plan.Candidates, tenantID, yearID, dueDate, uuid.NullUUID{UUID: actorUserID, Valid: true})
		created, err := s.repo.CreateBills(ctx, toInsert)
		if err != nil {
			return err
		}
		summary.Created = created
		// A concurrent run can insert a candidate between the plan and the
		// insert; the unique index skips it, and it counts as already billed.
		summary.Skipped += len(toInsert) - len(created)
		// One entry per run, not per bill: the period and the counts are
		// what a reviewer needs; each bill keeps its own created_by.
		return audit.Record(ctx, tenantID, "bill.generate", "bill", uuid.Nil, nil, map[string]any{
			"period": strings.TrimSpace(period), "created": len(created), "skipped": summary.Skipped,
		})
	})
	return summary, err
}

// plan loads the fee types, active enrollments, applicable discounts and
// already-billed keys for period, then hands them to the pure
// domain.PlanGeneration so both preview and generate compute the exact
// same candidates.
func (s *Service) plan(ctx context.Context, tenantID uuid.UUID, period string) (domain.GenerationPlan, time.Time, uuid.UUID, error) {
	var none domain.GenerationPlan
	period = strings.TrimSpace(period)
	if period == "" {
		return none, time.Time{}, uuid.Nil, domain.ErrInvalidInput
	}
	yearID, err := s.activeYear(ctx, tenantID)
	if err != nil {
		return none, time.Time{}, uuid.Nil, err
	}
	feeTypes, err := s.repo.ListActiveFeeTypes(ctx, tenantID, yearID)
	if err != nil {
		return none, time.Time{}, uuid.Nil, err
	}
	if len(feeTypes) == 0 {
		return none, time.Time{}, yearID, nil
	}
	students, err := s.repo.ListActiveEnrollments(ctx, tenantID, yearID)
	if err != nil {
		return none, time.Time{}, uuid.Nil, err
	}
	feeTypeIDs := make([]uuid.UUID, len(feeTypes))
	for i, ft := range feeTypes {
		feeTypeIDs[i] = ft.ID
	}
	discountRows, err := s.repo.ListActiveDiscounts(ctx, tenantID, feeTypeIDs)
	if err != nil {
		return none, time.Time{}, uuid.Nil, err
	}
	discounts := make(map[domain.FeeStudentKey]domain.Discount, len(discountRows))
	for _, d := range discountRows {
		discounts[domain.FeeStudentKey{FeeTypeID: d.FeeTypeID, StudentUserID: d.StudentUserID}] = d
	}
	existing, err := s.repo.ExistingBillKeys(ctx, tenantID, feeTypeIDs, domain.BillingPeriods(feeTypes, period))
	if err != nil {
		return none, time.Time{}, uuid.Nil, err
	}
	dueDate, err := s.dueDate(ctx, tenantID)
	if err != nil {
		return none, time.Time{}, uuid.Nil, err
	}
	return domain.PlanGeneration(feeTypes, students, period, discounts, existing), dueDate, yearID, nil
}

// billDueDays is how many days after the run a generated bill falls due.
const billDueDays = 10

// dueDate is the calendar day a bill generated now falls due: the
// school's local "today" on the business clock (the simulated time when
// the request carries one, docs/testing-time-simulation.md) plus
// billDueDays. Reading the process clock instead dated a bill issued in a
// simulated month by the real calendar, so the web, which compares
// due_date with the simulated today, showed it overdue the moment it was
// issued.
func (s *Service) dueDate(ctx context.Context, tenantID uuid.UUID) (time.Time, error) {
	tz, err := s.repo.TenantTimezone(ctx, tenantID)
	if err != nil {
		return time.Time{}, err
	}
	return localDueDate(clock.Now(ctx, s.clock), clock.Location(tz)), nil
}

// localDueDate is the date billDueDays after now's calendar day in loc
// (clock.LocalDate), at midnight UTC the way a DATE column value is carried.
func localDueDate(now time.Time, loc *time.Location) time.Time {
	return clock.LocalDate(now, loc).AddDate(0, 0, billDueDays)
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
