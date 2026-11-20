package service

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
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
		loan, err = s.borrowOne(ctx, tenantID, in, clock.Now(ctx, s.clock))
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
// domain error that stopped it -- the batch never aborts on a partial
// failure, it reports what worked and what did not (old app: {loan,
// rejected[]}). Err stays an error, not its text, so the transport can map
// it to the same stable code a single borrow call returns.
type RejectedBarcode struct {
	Barcode string
	Err     error
}

// BatchBorrowResult is BatchBorrow's outcome.
type BatchBorrowResult struct {
	Loans    []domain.Loan
	Rejected []RejectedBarcode
}

// BatchBorrow issues as many of the given barcodes as it can to one member
// in a single transaction, collecting failures into Rejected instead of
// aborting the whole batch. Barcodes are tried in the order given, so the
// caller decides which ones get the member's remaining quota. Even when
// every barcode is rejected the result is returned without an error: each
// row keeps its own reason (an unpaid fine, the loan limit, a suspended
// member), which a single generic "not available" error used to hide.
func (s *Service) BatchBorrow(ctx context.Context, tenantID uuid.UUID, in BatchBorrowInput) (BatchBorrowResult, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return BatchBorrowResult{}, err
	}
	var result BatchBorrowResult
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		now := clock.Now(ctx, s.clock)
		for _, barcode := range in.Barcodes {
			loan, err := s.borrowOne(ctx, tenantID, BorrowInput{
				Barcode: barcode, MemberUserID: in.MemberUserID, CheckedOutBy: in.CheckedOutBy, Channel: in.Channel,
			}, now)
			if err != nil {
				result.Rejected = append(result.Rejected, RejectedBarcode{Barcode: barcode, Err: err})
				continue
			}
			result.Loans = append(result.Loans, loan)
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

	// Every date rule below (loan rules, validity, the due date) is decided
	// on the school's calendar day; now itself is only the loan's instant.
	today := s.schoolToday(ctx, tenantID, now)
	member, err := s.resolveOrRegisterMember(ctx, tenantID, in.MemberUserID, policy, today)
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

	limits, err := s.effectiveLimits(ctx, tenantID, member, policy, today)
	if err != nil {
		return domain.Loan{}, err
	}
	if !limits.AllowLoans {
		return domain.Loan{}, domain.ErrLoansClosed
	}

	if err := member.EligibleToBorrow(today); err != nil {
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

	wdr, err := s.workingDayRule(ctx, tenantID, policy, today, limits.MaxLoanDays+14)
	if err != nil {
		return domain.Loan{}, err
	}
	dueOn := wdr.AddWorkingDays(today, limits.MaxLoanDays)

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

// effectiveLimits resolves the limits a borrow by member enforces on
// today (the school's calendar day): a dated loan rule for the member's
// type, then one for every type, then the member type's own limit, then
// the tenant policy. Borrowing and the circulation screens' quota display
// both read it, so the counter a reader sees is the one the server applies.
func (s *Service) effectiveLimits(ctx context.Context, tenantID uuid.UUID, member domain.Member, policy domain.Policy, today time.Time) (domain.EffectiveLimits, error) {
	memberType, foundType, err := s.repo.GetMemberType(ctx, tenantID, member.MemberTypeID)
	if err != nil {
		return domain.EffectiveLimits{}, err
	}
	if !foundType {
		return domain.EffectiveLimits{}, domain.ErrMemberTypeNotFound
	}
	rules, err := s.repo.ListLoanRulesActive(ctx, tenantID, today)
	if err != nil {
		return domain.EffectiveLimits{}, err
	}
	return domain.ResolveEffectiveLimits(rules, memberType, policy, today), nil
}

// MemberBorrowingStatus is what a circulation screen shows about a member
// before lending: the limits a borrow would enforce today, how much of the
// quota is in use, and whether an unpaid fine is in the way.
type MemberBorrowingStatus struct {
	Limits          domain.EffectiveLimits
	ActiveLoanCount int
	HasUnpaidFine   bool
	// FineBlocksLoans is HasUnpaidFine under a policy that refuses loans
	// while a fine is unpaid.
	FineBlocksLoans bool
}

// GetMemberBorrowingStatus reports MemberBorrowingStatus for one member,
// using the same rules borrowOneWithQuota enforces.
func (s *Service) GetMemberBorrowingStatus(ctx context.Context, tenantID, userID uuid.UUID) (MemberBorrowingStatus, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return MemberBorrowingStatus{}, err
	}
	var out MemberBorrowingStatus
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		member, found, err := s.repo.GetMember(ctx, tenantID, userID)
		if err != nil {
			return err
		}
		if !found {
			return domain.ErrMemberNotFound
		}
		policy, err := s.loadPolicy(ctx, tenantID)
		if err != nil {
			return err
		}
		today := s.schoolToday(ctx, tenantID, clock.Now(ctx, s.clock))
		if out.Limits, err = s.effectiveLimits(ctx, tenantID, member, policy, today); err != nil {
			return err
		}
		if out.ActiveLoanCount, err = s.repo.CountActiveLoansForMember(ctx, tenantID, userID); err != nil {
			return err
		}
		if out.HasUnpaidFine, err = s.repo.HasUnpaidFine(ctx, tenantID, userID); err != nil {
			return err
		}
		out.FineBlocksLoans = out.HasUnpaidFine && policy.BlockLoansWithUnpaidFines
		return nil
	})
	return out, err
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
// business-rule guard clauses gate one write or one aggregated read;
// the branches are sequential guards, not nested decision logic, and
// the module's existing test suite already covers them. Left as-is
// here to avoid behaviour risk in a lint-only change.
//
//nolint:gocyclo // service method: several independent precondition/authorization/
func (s *Service) Return(ctx context.Context, tenantID uuid.UUID, in ReturnInput) (domain.Loan, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return domain.Loan{}, err
	}
	var loan domain.Loan
	var ready domain.Reservation
	var hasReady bool
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
		now := clock.Now(ctx, s.clock)
		today := s.schoolToday(ctx, tenantID, now)

		lateDays, outcome, err := s.lateOutcome(ctx, tenantID, existing, policy, today, s.memberLateRule(ctx, tenantID, existing.MemberUserID, policy, nil))
		if err != nil {
			return err
		}

		// The fine charged is kept on the loan as well as on its violation
		// (as MarkLost does), so the return result, the member's loan list
		// and the monthly "fines recorded" figure all carry the real amount.
		fine := 0
		if lateDays > 0 {
			if fine, err = s.recordLateOutcome(ctx, tenantID, existing, outcome, today); err != nil {
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
		loan.LateDays = lateDays
		if _, err := s.repo.CreateCirculationEvent(ctx, domain.ItemEventRecord{
			TenantID: tenantID, CopyID: existing.CopyID, LoanID: uuid.NullUUID{UUID: existing.ID, Valid: true},
			MemberUserID: uuid.NullUUID{UUID: existing.MemberUserID, Valid: true}, EventType: domain.EventReturned,
			CreatedBy: uuid.NullUUID{UUID: in.CheckedInBy, Valid: true},
		}); err != nil {
			return err
		}
		var err2 error
		ready, hasReady, err2 = s.releaseCopyAfterReturn(ctx, tenantID, existing.CopyID, existing.TitleID, in.Condition)
		return err2
	})
	if err != nil {
		return domain.Loan{}, err
	}
	if hasReady {
		s.publishReservationReady(ctx, tenantID, ready)
	}
	return loan, nil
}

// memberLateRule is the late-return rule for a member: their member type's
// fine and suspension settings, or the policy's per-day fine
// (domain.PolicyLateRule) for a member with no type. types, when not nil,
// caches member types by ID so a report over many members looks each type
// up once.
func (s *Service) memberLateRule(ctx context.Context, tenantID, memberUserID uuid.UUID, policy domain.Policy, types map[uuid.UUID]domain.MemberType) domain.MemberType {
	member, found, err := s.repo.GetMember(ctx, tenantID, memberUserID)
	if err != nil || !found {
		return domain.PolicyLateRule(policy)
	}
	if mt, cached := types[member.MemberTypeID]; cached {
		return mt
	}
	mt, foundType, err := s.repo.GetMemberType(ctx, tenantID, member.MemberTypeID)
	if err != nil || !foundType {
		return domain.PolicyLateRule(policy)
	}
	if types != nil {
		types[member.MemberTypeID] = mt
	}
	return mt
}

// lateOutcome is what returning loan on today (the school's calendar day)
// resolves to: the working days late under the tenant's weekend and
// holiday calendar, and the fine, suspension or warning the member's rule
// gives for them (lateOutcomeWith). It loads the holiday calendar for this
// one loan; the overdue report builds one calendar for all its loans and
// calls lateOutcomeWith directly, so both price a late return the same way.
func (s *Service) lateOutcome(ctx context.Context, tenantID uuid.UUID, loan domain.Loan, policy domain.Policy, today time.Time, rule domain.MemberType) (int, domain.LateOutcome, error) {
	if !today.After(loan.DueOn) {
		return 0, domain.LateOutcome{}, nil
	}
	wdr, err := s.workingDayRule(ctx, tenantID, policy, loan.DueOn, daysUntil(loan.DueOn, today)+1)
	if err != nil {
		return 0, domain.LateOutcome{}, err
	}
	lateDays, outcome := lateOutcomeWith(wdr, loan, policy, today, rule)
	return lateDays, outcome, nil
}

// lateOutcomeWith prices returning loan on today under an already loaded
// working-day calendar wdr, which must cover loan.DueOn through today:
// the working days late, and the outcome domain.ComputeLateOutcome gives
// the member's rule for them (zero outcome when not late).
func lateOutcomeWith(wdr domain.WorkingDayRule, loan domain.Loan, policy domain.Policy, today time.Time, rule domain.MemberType) (int, domain.LateOutcome) {
	lateDays := wdr.WorkingDaysLate(loan.DueOn, today)
	if lateDays == 0 {
		return 0, domain.LateOutcome{}
	}
	return lateDays, domain.ComputeLateOutcome(lateDays, policy.FineCurrencyEnabled, rule)
}

// daysUntil is the whole calendar days from from to to (negative when to
// is earlier), for sizing a holiday-calendar window.
func daysUntil(from, to time.Time) int {
	return int(to.Sub(from).Hours() / 24)
}

// recordLateOutcome applies the old app's late-return decision
// (library_common.go:284-296) as a violation: a currency fine when the
// tenant enables it, otherwise a suspension of the member from today (the
// school's calendar day), otherwise a bare warning. It returns the fine
// charged, zero for a suspension or a warning.
func (s *Service) recordLateOutcome(ctx context.Context, tenantID uuid.UUID, loan domain.Loan, outcome domain.LateOutcome, today time.Time) (int, error) {
	switch outcome.Penalty {
	case domain.PenaltyFine:
		_, err := s.repo.CreateViolation(ctx, domain.Violation{
			TenantID: tenantID, LoanID: uuid.NullUUID{UUID: loan.ID, Valid: true}, MemberUserID: loan.MemberUserID,
			Kind: domain.ViolationLate, Penalty: domain.PenaltyFine, Amount: outcome.FineAmount, Status: domain.ViolationUnpaid,
			CreatedBy: loan.CheckedOutBy,
		})
		if err != nil {
			return 0, err
		}
		return outcome.FineAmount, nil
	case domain.PenaltySuspend:
		suspendedUntil := today.AddDate(0, 0, outcome.SuspendDays)
		if _, err := s.repo.CreateViolation(ctx, domain.Violation{
			TenantID: tenantID, LoanID: uuid.NullUUID{UUID: loan.ID, Valid: true}, MemberUserID: loan.MemberUserID,
			Kind: domain.ViolationLate, Penalty: domain.PenaltySuspend, SuspendDays: outcome.SuspendDays, Status: domain.ViolationUnpaid,
			CreatedBy: loan.CheckedOutBy,
		}); err != nil {
			return 0, err
		}
		nullableDate := nullableDatePtr(suspendedUntil)
		_, _, err := s.repo.UpdateMemberStatus(ctx, tenantID, loan.MemberUserID, domain.MemberSuspended, nullableDate)
		return 0, err
	default: // warning: recorded for the history, no fine and no suspension
		_, err := s.repo.CreateViolation(ctx, domain.Violation{
			TenantID: tenantID, LoanID: uuid.NullUUID{UUID: loan.ID, Valid: true}, MemberUserID: loan.MemberUserID,
			Kind: domain.ViolationLate, Penalty: domain.PenaltyWarning, Status: domain.ViolationWaived,
			CreatedBy: loan.CheckedOutBy,
		})
		return 0, err
	}
}

// releaseCopyAfterReturn puts a returned copy back into circulation: if a
// member is waiting for the title it goes straight to them (status
// reserved, held for the policy's hold window, notified), otherwise it
// becomes available again. Returns the reservation marked ready, if any
// (ok=false when the copy simply went back to available) -- callers
// publish the live "library.reservation_ready" hub push themselves, after
// their own outer transaction commits (docs/analysis/
// realtime-plan-2026-09-25.md: "Publish AFTER the transaction commits"),
// instead of this shared helper doing it mid-transaction.
//
// A copy no one may borrow (reference or read-in-place, e.g. one whose
// access was changed while it was out) is never held: the member could not
// take it home, so it goes back on the shelf and the queue keeps waiting
// for a loanable copy.
func (s *Service) releaseCopyAfterReturn(ctx context.Context, tenantID, copyID, titleID uuid.UUID, condition *domain.CopyCondition) (domain.Reservation, bool, error) {
	copyRow, found, err := s.repo.GetCopy(ctx, tenantID, copyID)
	if err != nil {
		return domain.Reservation{}, false, err
	}
	if found && !copyRow.Loanable() {
		_, err := s.repo.UpdateCopyStatus(ctx, tenantID, copyID, domain.CopyAvailable, condition)
		return domain.Reservation{}, false, err
	}
	waiting, err := s.repo.ListReservationsForTitle(ctx, tenantID, titleID)
	if err != nil {
		return domain.Reservation{}, false, err
	}
	next, hasNext := domain.NextWaiting(waiting)
	if !hasNext {
		_, err := s.repo.UpdateCopyStatus(ctx, tenantID, copyID, domain.CopyAvailable, condition)
		return domain.Reservation{}, false, err
	}
	if _, err := s.repo.UpdateCopyStatus(ctx, tenantID, copyID, domain.CopyReserved, condition); err != nil {
		return domain.Reservation{}, false, err
	}
	policy, err := s.loadPolicy(ctx, tenantID)
	if err != nil {
		return domain.Reservation{}, false, err
	}
	now := clock.Now(ctx, s.clock)
	ready, _, err := s.repo.MarkReservationReady(ctx, tenantID, next.ID, copyID, now, now.AddDate(0, 0, policy.ReservationHoldDays))
	if err != nil {
		return domain.Reservation{}, false, err
	}
	if err := s.publish(ctx, ReservationReadyEvent{TenantID: tenantID, ReservationID: ready.ID, TitleID: titleID, MemberUserID: ready.MemberUserID}); err != nil {
		return domain.Reservation{}, false, err
	}
	return ready, true, nil
}

// ReservationReadyEvent is published when a hold becomes ready for pickup,
// for the notifications bridge to alert the member.
type ReservationReadyEvent struct {
	TenantID      uuid.UUID
	ReservationID uuid.UUID
	TitleID       uuid.UUID
	MemberUserID  uuid.UUID
}

// EventName is distinct from platform/events.LibraryReservationReady so the
// notification bridge's Envelope republish never reaches its own typed
// subscriber (see scheduling's SubstitutionRequested.EventName).
func (ReservationReadyEvent) EventName() string { return "library.loans.reservation_ready" }

// RenewInput is a renewal by loan ID (desk overdue table, member history) or
// by barcode (desk continuous scan flow) -- exactly one must be set, mirroring ReturnInput.
type RenewInput struct {
	LoanID  uuid.NullUUID
	Barcode string
}

// Renew extends a loan's due date to a working day n renewal_days after
// max(today, due_on) (old app: library_circulation.go:970-1078). It is
// refused for a loan already at its renewal limit, one that is overdue,
// one whose member is currently suspended, or one whose title has a
// member waiting in the reservation queue.
//
//nolint:gocyclo // the old app's renewal checks (library_circulation.go:970-1078) are a fixed sequence; kept linear for auditability of the rule order
func (s *Service) Renew(ctx context.Context, tenantID uuid.UUID, in RenewInput, renewedBy uuid.UUID) (domain.Loan, error) {
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
		loanID := existing.ID
		policy, err := s.loadPolicy(ctx, tenantID)
		if err != nil {
			return err
		}
		waiting, err := s.repo.ListReservationsForTitle(ctx, tenantID, existing.TitleID)
		if err != nil {
			return err
		}
		_, hasWaiting := domain.NextWaiting(waiting)
		now := clock.Now(ctx, s.clock)
		today := s.schoolToday(ctx, tenantID, now)

		// The member's type sets both how often and by how much a loan is
		// renewed (the settings screen edits them per type); the policy
		// only speaks for a member with no type.
		member, memberFound, err := s.repo.GetMember(ctx, tenantID, existing.MemberUserID)
		if err != nil {
			return err
		}
		var memberType domain.MemberType
		hasType := false
		if memberFound {
			if memberType, hasType, err = s.repo.GetMemberType(ctx, tenantID, member.MemberTypeID); err != nil {
				return err
			}
		}
		maxRenewals, renewalDays := domain.RenewalLimits(memberType, hasType, policy)

		if err := domain.CanRenew(existing, maxRenewals, today, hasWaiting); err != nil {
			return err
		}
		if memberFound {
			if err := member.EligibleToBorrow(today); err != nil {
				return err
			}
		}

		base := existing.DueOn
		if today.After(base) {
			base = today
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
		now := clock.Now(ctx, s.clock)
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
		out, err = s.repo.ListOverdueLoans(ctx, tenantID, s.schoolToday(ctx, tenantID, clock.Now(ctx, s.clock)))
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
		out, err = s.repo.ListOverdueLoansDetailed(ctx, tenantID, s.schoolToday(ctx, tenantID, clock.Now(ctx, s.clock)))
		return err
	})
	return out, err
}

func nullableDatePtr(t time.Time) *pgtype.Date {
	d := pgtype.Date{Time: t, Valid: true}
	return &d
}
