package service

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
)

// BorrowInput is what the loan desk collects: the copy's barcode, who is
// borrowing it, who is checking it out (a librarian or a kiosk actor), and
// which desk the loan came through.
type BorrowInput struct {
	Barcode      string
	MemberUserID uuid.UUID
	CheckedOutBy uuid.UUID
	Channel      domain.Channel
}

// Borrow issues a copy to a member. A copy already on loan cannot be
// borrowed again; a copy reserved for a different member's ready hold
// cannot be borrowed by anyone else.
func (s *Service) Borrow(ctx context.Context, tenantID uuid.UUID, in BorrowInput) (domain.Loan, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return domain.Loan{}, err
	}
	var loan domain.Loan
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		loan, err = s.borrowOne(ctx, tenantID, in, s.clock.Now())
		return err
	})
	return loan, err
}

// BatchBorrowInput is a desk checking out several barcodes to one member in
// one visit (old app: library_circulation.go:669-763).
type BatchBorrowInput struct {
	Barcodes     []string
	MemberUserID uuid.UUID
	CheckedOutBy uuid.UUID
	Channel      domain.Channel
}

// RejectedBarcode is one barcode BatchBorrow could not issue, with the
// reason -- the batch never aborts on a partial failure, it reports what
// worked and what did not (old app: {loan, rejected[]}).
type RejectedBarcode struct {
	Barcode string
	Reason  string
}

// BatchBorrowResult is BatchBorrow's outcome.
type BatchBorrowResult struct {
	Loans    []domain.Loan
	Rejected []RejectedBarcode
}

// BatchBorrow issues as many of the given barcodes as it can to one member
// in a single transaction, collecting failures into Rejected instead of
// aborting the whole batch. It fails outright (no loans at all) only when
// every barcode was rejected.
func (s *Service) BatchBorrow(ctx context.Context, tenantID uuid.UUID, in BatchBorrowInput) (BatchBorrowResult, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return BatchBorrowResult{}, err
	}
	var result BatchBorrowResult
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		now := s.clock.Now()
		for _, barcode := range in.Barcodes {
			loan, err := s.borrowOne(ctx, tenantID, BorrowInput{
				Barcode: barcode, MemberUserID: in.MemberUserID, CheckedOutBy: in.CheckedOutBy, Channel: in.Channel,
			}, now)
			if err != nil {
				result.Rejected = append(result.Rejected, RejectedBarcode{Barcode: barcode, Reason: err.Error()})
				continue
			}
			result.Loans = append(result.Loans, loan)
		}
		if len(result.Loans) == 0 && len(result.Rejected) > 0 {
			return domain.ErrCopyNotAvailable
		}
		return nil
	})
	return result, err
}

// borrowOne is the eligibility chain the old app spread across
// library_circulation.go:350-403: resolve or auto-register the member,
// resolve the copy (allowing the member's own ready hold), resolve the
// dated/type/tenant loan limits in priority order, check member status and
// validity, check the unpaid-fine block, check the active-loan quota, then
// compute a working-day due date.
func (s *Service) borrowOne(ctx context.Context, tenantID uuid.UUID, in BorrowInput, now time.Time) (domain.Loan, error) {
	return s.borrowOneWithQuota(ctx, tenantID, in, now, true)
}

// borrowOneWithQuota is borrowOne with the active-loan quota check made
// optional: class textbook loans bypass it entirely (old app:
// library_circulation_v2.go "melewati kuota"), since a class set's
// worth of copies going out at once is not the same thing the personal
// quota exists to limit.
//
//nolint:gocyclo // the old app's eligibility chain (library_circulation.go:350-403) is a fixed sequence of independent checks; kept linear for auditability of the rule order
func (s *Service) borrowOneWithQuota(ctx context.Context, tenantID uuid.UUID, in BorrowInput, now time.Time, enforceQuota bool) (domain.Loan, error) {
	policy, err := s.loadPolicy(ctx, tenantID)
	if err != nil {
		return domain.Loan{}, err
	}
	item, found, err := s.repo.GetCopyByBarcode(ctx, tenantID, in.Barcode)
	if err != nil {
		return domain.Loan{}, err
	}
	if !found {
		return domain.Loan{}, domain.ErrCopyNotFound
	}

	member, err := s.resolveOrRegisterMember(ctx, tenantID, in.MemberUserID, policy, now)
	if err != nil {
		return domain.Loan{}, err
	}

	var readyReservation *domain.Reservation
	if item.Status == domain.CopyReserved {
		resv, hasReady, err := s.repo.GetReservationForHeldCopy(ctx, tenantID, item.ID)
		if err != nil {
			return domain.Loan{}, err
		}
		if hasReady && resv.MemberUserID == member.UserID {
			readyReservation = &resv
		}
	}
	if err := item.CanBorrowBy(readyReservation != nil); err != nil {
		return domain.Loan{}, err
	}

	memberType, foundType, err := s.repo.GetMemberType(ctx, tenantID, member.MemberTypeID)
	if err != nil {
		return domain.Loan{}, err
	}
	if !foundType {
		return domain.Loan{}, domain.ErrMemberTypeNotFound
	}
	rules, err := s.repo.ListLoanRulesActive(ctx, tenantID, now)
	if err != nil {
		return domain.Loan{}, err
	}
	limits := domain.ResolveEffectiveLimits(rules, memberType, policy, now)
	if !limits.AllowLoans {
		return domain.Loan{}, domain.ErrLoansClosed
	}

	if err := member.EligibleToBorrow(now); err != nil {
		return domain.Loan{}, err
	}

	if policy.BlockLoansWithUnpaidFines {
		hasFine, err := s.repo.HasUnpaidFine(ctx, tenantID, member.UserID)
		if err != nil {
			return domain.Loan{}, err
		}
		if hasFine {
			return domain.Loan{}, domain.ErrUnpaidFine
		}
	}

	if enforceQuota {
		activeCount, err := s.repo.CountActiveLoansForMember(ctx, tenantID, member.UserID)
		if err != nil {
			return domain.Loan{}, err
		}
		if activeCount >= limits.MaxLoanItems {
			return domain.Loan{}, domain.ErrLoanLimitReached
		}
	}

	wdr, err := s.workingDayRule(ctx, tenantID, policy, now, limits.MaxLoanDays+14)
	if err != nil {
		return domain.Loan{}, err
	}
	dueOn := wdr.AddWorkingDays(now, limits.MaxLoanDays)

	channel := in.Channel
	if channel == "" {
		channel = domain.ChannelDesk
	}
	loan, err := s.repo.CreateLoan(ctx, domain.Loan{
		TenantID: tenantID, CopyID: item.ID, TitleID: item.TitleID, MemberUserID: member.UserID,
		CheckedOutBy: in.CheckedOutBy, BorrowedAt: now, DueOn: dueOn, Channel: channel,
	})
	if err != nil {
		return domain.Loan{}, err
	}
	if _, err := s.repo.UpdateCopyStatus(ctx, tenantID, item.ID, domain.CopyOnLoan, nil); err != nil {
		return domain.Loan{}, err
	}
	if _, err := s.repo.CreateCirculationEvent(ctx, domain.ItemEventRecord{
		TenantID: tenantID, CopyID: item.ID, LoanID: uuid.NullUUID{UUID: loan.ID, Valid: true},
		MemberUserID: uuid.NullUUID{UUID: member.UserID, Valid: true}, EventType: domain.EventBorrowed,
		CreatedBy: uuid.NullUUID{UUID: in.CheckedOutBy, Valid: true},
	}); err != nil {
		return domain.Loan{}, err
	}
	if readyReservation != nil {
		if _, _, err := s.repo.FulfillReservation(ctx, tenantID, readyReservation.ID, loan.ID); err != nil {
			return domain.Loan{}, err
		}
	}
	return loan, nil
}

// workingDayRule loads the tenant's holiday calendar for a window starting
// at from and running horizonDays ahead, wide enough to cover the due-date
// or renewal computation that called it.
func (s *Service) workingDayRule(ctx context.Context, tenantID uuid.UUID, policy domain.Policy, from time.Time, horizonDays int) (domain.WorkingDayRule, error) {
	holidays, err := s.repo.HolidayDates(ctx, tenantID, from, from.AddDate(0, 0, horizonDays))
	if err != nil {
		return domain.WorkingDayRule{}, err
	}
	return policy.WorkingDays(holidays), nil
}

// ReturnInput is a return by loan ID (desk) or by barcode (kiosk/self
// service, old app libraryReturnOneCode) -- exactly one must be set.
type ReturnInput struct {
	LoanID      uuid.NullUUID
	Barcode     string
	CheckedInBy uuid.UUID
	Condition   *domain.CopyCondition
}

// Return closes a loan, computes any overdue outcome (fine, suspension, or
// warning per the member's type), frees the copy, and hands it straight to
// the next waiting reservation if one exists.
func (s *Service) Return(ctx context.Context, tenantID uuid.UUID, in ReturnInput) (domain.Loan, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return domain.Loan{}, err
	}
	var loan domain.Loan
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var existing domain.Loan
		var found bool
		var err error
		if in.LoanID.Valid {
			existing, found, err = s.repo.GetLoan(ctx, tenantID, in.LoanID.UUID)
		} else {
			existing, found, err = s.repo.GetLoanByBarcode(ctx, tenantID, in.Barcode)
		}
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

		wdr, err := s.workingDayRule(ctx, tenantID, policy, existing.DueOn, 60)
		if err != nil {
			return err
		}
		lateDays := wdr.WorkingDaysLate(existing.DueOn, now)

		fine := 0
		if lateDays > 0 {
			if err := s.recordLateOutcome(ctx, tenantID, existing, lateDays, policy, now); err != nil {
				return err
			}
			if _, memberFound, findErr := s.repo.GetMember(ctx, tenantID, existing.MemberUserID); findErr == nil && memberFound {
				if _, err := s.repo.IncrementLateReturnCount(ctx, tenantID, existing.MemberUserID); err != nil {
					return err
				}
			}
		}
		loan, _, err = s.repo.ReturnLoan(ctx, tenantID, existing.ID, now, in.CheckedInBy, fine)
		if err != nil {
			return err
		}
		if _, err := s.repo.CreateCirculationEvent(ctx, domain.ItemEventRecord{
			TenantID: tenantID, CopyID: existing.CopyID, LoanID: uuid.NullUUID{UUID: existing.ID, Valid: true},
			MemberUserID: uuid.NullUUID{UUID: existing.MemberUserID, Valid: true}, EventType: domain.EventReturned,
			CreatedBy: uuid.NullUUID{UUID: in.CheckedInBy, Valid: true},
		}); err != nil {
			return err
		}
		return s.releaseCopyAfterReturn(ctx, tenantID, existing.CopyID, existing.TitleID, in.Condition)
	})
	return loan, err
}

// recordLateOutcome applies the old app's late-return decision
// (library_common.go:284-296): a currency fine (recorded on the loan
// itself, unchanged from before) when the tenant enables it, otherwise a
// violation that either suspends the member or is a bare warning.
func (s *Service) recordLateOutcome(ctx context.Context, tenantID uuid.UUID, loan domain.Loan, lateDays int, policy domain.Policy, now time.Time) error {
	memberType := domain.MemberType{FineType: domain.FineConstant, FinePerTenor: policy.FinePerDay, TenorDays: 1}
	if member, found, err := s.repo.GetMember(ctx, tenantID, loan.MemberUserID); err == nil && found {
		if mt, foundType, err := s.repo.GetMemberType(ctx, tenantID, member.MemberTypeID); err == nil && foundType {
			memberType = mt
		}
	}
	outcome := domain.ComputeLateOutcome(lateDays, policy.FineCurrencyEnabled, memberType)

	switch outcome.Penalty {
	case domain.PenaltyFine:
		_, err := s.repo.CreateViolation(ctx, domain.Violation{
			TenantID: tenantID, LoanID: uuid.NullUUID{UUID: loan.ID, Valid: true}, MemberUserID: loan.MemberUserID,
			Kind: domain.ViolationLate, Penalty: domain.PenaltyFine, Amount: outcome.FineAmount, Status: domain.ViolationUnpaid,
			CreatedBy: loan.CheckedOutBy,
		})
		return err
	case domain.PenaltySuspend:
		suspendedUntil := now.AddDate(0, 0, outcome.SuspendDays)
		if _, err := s.repo.CreateViolation(ctx, domain.Violation{
			TenantID: tenantID, LoanID: uuid.NullUUID{UUID: loan.ID, Valid: true}, MemberUserID: loan.MemberUserID,
			Kind: domain.ViolationLate, Penalty: domain.PenaltySuspend, SuspendDays: outcome.SuspendDays, Status: domain.ViolationUnpaid,
			CreatedBy: loan.CheckedOutBy,
		}); err != nil {
			return err
		}
		nullableDate := nullableDatePtr(suspendedUntil)
		_, _, err := s.repo.UpdateMemberStatus(ctx, tenantID, loan.MemberUserID, domain.MemberSuspended, nullableDate)
		return err
	default: // warning: recorded for the history, no fine and no suspension
		_, err := s.repo.CreateViolation(ctx, domain.Violation{
			TenantID: tenantID, LoanID: uuid.NullUUID{UUID: loan.ID, Valid: true}, MemberUserID: loan.MemberUserID,
			Kind: domain.ViolationLate, Penalty: domain.PenaltyWarning, Status: domain.ViolationWaived,
			CreatedBy: loan.CheckedOutBy,
		})
		return err
	}
}

// releaseCopyAfterReturn puts a returned copy back into circulation: if a
// member is waiting for the title it goes straight to them (status
// reserved, held for the policy's hold window, notified), otherwise it
// becomes available again.
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
	ready, _, err := s.repo.MarkReservationReady(ctx, tenantID, next.ID, copyID, now, now.AddDate(0, 0, policy.ReservationHoldDays))
	if err != nil {
		return err
	}
	return s.publish(ctx, ReservationReadyEvent{TenantID: tenantID, ReservationID: ready.ID, TitleID: titleID, MemberUserID: ready.MemberUserID})
}

// ReservationReadyEvent is published when a hold becomes ready for pickup,
// for the notifications bridge to alert the member.
type ReservationReadyEvent struct {
	TenantID      uuid.UUID
	ReservationID uuid.UUID
	TitleID       uuid.UUID
	MemberUserID  uuid.UUID
}

func (ReservationReadyEvent) EventName() string { return "library.reservation_ready" }

// Renew extends a loan's due date to a working day n renewal_days after
// max(today, due_on) (old app: library_circulation.go:970-1078). It is
// refused for a loan already at its renewal limit, one that is overdue,
// one whose member is currently suspended, or one whose title has a
// member waiting in the reservation queue.
//
//nolint:gocyclo // the old app's renewal checks (library_circulation.go:970-1078) are a fixed sequence; kept linear for auditability of the rule order
func (s *Service) Renew(ctx context.Context, tenantID, loanID uuid.UUID, renewedBy uuid.UUID) (domain.Loan, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return domain.Loan{}, err
	}
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
		if member, found, err := s.repo.GetMember(ctx, tenantID, existing.MemberUserID); err != nil {
			return err
		} else if found {
			if err := member.EligibleToBorrow(now); err != nil {
				return err
			}
		}

		renewalDays := policy.RenewalDays
		if member, found, err := s.repo.GetMember(ctx, tenantID, existing.MemberUserID); err == nil && found {
			if mt, foundType, err := s.repo.GetMemberType(ctx, tenantID, member.MemberTypeID); err == nil && foundType && mt.RenewalDays > 0 {
				renewalDays = mt.RenewalDays
			}
		}
		base := existing.DueOn
		if now.After(base) {
			base = now
		}
		wdr, err := s.workingDayRule(ctx, tenantID, policy, base, renewalDays+14)
		if err != nil {
			return err
		}
		newDueOn := wdr.AddWorkingDays(base, renewalDays)

		loan, _, err = s.repo.RenewLoan(ctx, tenantID, loanID, newDueOn)
		if err != nil {
			return err
		}
		if _, err := s.repo.CreateLoanRenewal(ctx, domain.LoanRenewal{
			TenantID: tenantID, LoanID: loanID, RenewedAt: now, PreviousDueOn: existing.DueOn, NewDueOn: newDueOn, RenewedBy: renewedBy,
		}); err != nil {
			return err
		}
		_, err = s.repo.CreateCirculationEvent(ctx, domain.ItemEventRecord{
			TenantID: tenantID, CopyID: existing.CopyID, LoanID: uuid.NullUUID{UUID: loanID, Valid: true},
			MemberUserID: uuid.NullUUID{UUID: existing.MemberUserID, Valid: true}, EventType: domain.EventRenewed,
			CreatedBy: uuid.NullUUID{UUID: renewedBy, Valid: true},
		})
		return err
	})
	return loan, err
}

// RenewalHistory returns every renewal recorded for one loan.
func (s *Service) RenewalHistory(ctx context.Context, tenantID, loanID uuid.UUID) ([]domain.LoanRenewal, error) {
	var out []domain.LoanRenewal
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListLoanRenewalsForLoan(ctx, tenantID, loanID)
		return err
	})
	return out, err
}

// MarkLost closes a loan as lost and charges the copy's condition instead
// of a per-day fine; replacementCost is the fine when the penalty is a
// currency charge, or ignored when penalty is replace_book (the member
// physically replaces the title instead).
func (s *Service) MarkLost(ctx context.Context, tenantID, loanID, checkedInBy uuid.UUID, penalty domain.Penalty, replacementCost int, notes string) (domain.Loan, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return domain.Loan{}, err
	}
	if !penalty.Valid() {
		penalty = domain.PenaltyFine
	}
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
		fineAmount := 0
		if penalty == domain.PenaltyFine {
			fineAmount = replacementCost
		}
		loan, _, err = s.repo.MarkLoanLost(ctx, tenantID, loanID, now, checkedInBy, fineAmount)
		if err != nil {
			return err
		}
		lost := domain.ConditionLost
		if _, err := s.repo.UpdateCopyStatus(ctx, tenantID, existing.CopyID, domain.CopyLost, &lost); err != nil {
			return err
		}
		if _, err := s.repo.CreateCirculationEvent(ctx, domain.ItemEventRecord{
			TenantID: tenantID, CopyID: existing.CopyID, LoanID: uuid.NullUUID{UUID: loanID, Valid: true},
			MemberUserID: uuid.NullUUID{UUID: existing.MemberUserID, Valid: true}, EventType: domain.EventLost,
			Notes: notes, CreatedBy: uuid.NullUUID{UUID: checkedInBy, Valid: true},
		}); err != nil {
			return err
		}
		_, err = s.repo.CreateViolation(ctx, domain.Violation{
			TenantID: tenantID, LoanID: uuid.NullUUID{UUID: loanID, Valid: true}, MemberUserID: existing.MemberUserID,
			Kind: domain.ViolationLost, Penalty: penalty, Amount: fineAmount, Status: domain.ViolationUnpaid,
			Notes: notes, CreatedBy: checkedInBy,
		})
		return err
	})
	return loan, err
}

func (s *Service) MemberLoanHistory(ctx context.Context, tenantID, memberID uuid.UUID, includeReturned bool, limit, offset int) ([]domain.Loan, error) {
	var out []domain.Loan
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListLoansForMember(ctx, tenantID, memberID, includeReturned, clampLimit(limit), offset)
		return err
	})
	return out, err
}

func (s *Service) OverdueLoans(ctx context.Context, tenantID uuid.UUID) ([]domain.Loan, error) {
	var out []domain.Loan
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListOverdueLoans(ctx, tenantID, s.clock.Now())
		return err
	})
	return out, err
}

// OverdueLoansDetailed is the overdue list with class and guardian phone
// (old app: library_circulation_v2.go:634-678).
func (s *Service) OverdueLoansDetailed(ctx context.Context, tenantID uuid.UUID) ([]OverdueLoanDetail, error) {
	var out []OverdueLoanDetail
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListOverdueLoansDetailed(ctx, tenantID, s.clock.Now())
		return err
	})
	return out, err
}

func nullableDatePtr(t time.Time) *pgtype.Date {
	d := pgtype.Date{Time: t, Valid: true}
	return &d
}
