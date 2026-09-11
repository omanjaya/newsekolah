package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func (r *Repository) CreateLoan(ctx context.Context, l domain.Loan) (domain.Loan, error) {
	channel := l.Channel
	if channel == "" {
		channel = domain.ChannelDesk
	}
	row, err := r.queries(ctx).CreateLoan(ctx, db.CreateLoanParams{
		TenantID: l.TenantID, CopyID: l.CopyID, TitleID: l.TitleID, MemberUserID: l.MemberUserID, CheckedOutBy: l.CheckedOutBy,
		BorrowedAt: pdatabase.Timestamptz(l.BorrowedAt), DueOn: pdatabase.Date(l.DueOn), Channel: string(channel),
	})
	if isUnique(err) {
		return domain.Loan{}, domain.ErrCopyOnLoan
	}
	if err != nil {
		return domain.Loan{}, fmt.Errorf("create loan: %w", err)
	}
	return toLoan(row), nil
}

func (r *Repository) GetLoan(ctx context.Context, tenantID, id uuid.UUID) (domain.Loan, bool, error) {
	row, err := r.queries(ctx).GetLoan(ctx, db.GetLoanParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Loan{}, false, nil
	}
	if err != nil {
		return domain.Loan{}, false, fmt.Errorf("get loan: %w", err)
	}
	return toLoan(row), true, nil
}

func (r *Repository) GetActiveLoanForCopy(ctx context.Context, tenantID, copyID uuid.UUID) (domain.Loan, bool, error) {
	row, err := r.queries(ctx).GetActiveLoanForCopy(ctx, db.GetActiveLoanForCopyParams{TenantID: tenantID, CopyID: copyID})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Loan{}, false, nil
	}
	if err != nil {
		return domain.Loan{}, false, fmt.Errorf("get active loan for copy: %w", err)
	}
	return toLoan(row), true, nil
}

func (r *Repository) CountActiveLoansForMember(ctx context.Context, tenantID, memberID uuid.UUID) (int, error) {
	n, err := r.queries(ctx).CountActiveLoansForMember(ctx, db.CountActiveLoansForMemberParams{TenantID: tenantID, MemberUserID: memberID})
	if err != nil {
		return 0, fmt.Errorf("count active loans: %w", err)
	}
	return int(n), nil
}

func (r *Repository) ReturnLoan(ctx context.Context, tenantID, id uuid.UUID, returnedAt time.Time, checkedInBy uuid.UUID, fineAmount int) (domain.Loan, bool, error) {
	row, err := r.queries(ctx).ReturnLoan(ctx, db.ReturnLoanParams{
		TenantID: tenantID, ID: id, ReturnedAt: pdatabase.Timestamptz(returnedAt),
		CheckedInBy: pdatabase.NullUUID(uuid.NullUUID{UUID: checkedInBy, Valid: true}), FineAmount: int32(fineAmount), //nolint:gosec // computed, capped by policy
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Loan{}, false, nil
	}
	if err != nil {
		return domain.Loan{}, false, fmt.Errorf("return loan: %w", err)
	}
	return toLoan(row), true, nil
}

func (r *Repository) MarkLoanLost(ctx context.Context, tenantID, id uuid.UUID, returnedAt time.Time, checkedInBy uuid.UUID, fineAmount int) (domain.Loan, bool, error) {
	row, err := r.queries(ctx).MarkLoanLost(ctx, db.MarkLoanLostParams{
		TenantID: tenantID, ID: id, ReturnedAt: pdatabase.Timestamptz(returnedAt),
		CheckedInBy: pdatabase.NullUUID(uuid.NullUUID{UUID: checkedInBy, Valid: true}), FineAmount: int32(fineAmount), //nolint:gosec // computed, capped by policy
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Loan{}, false, nil
	}
	if err != nil {
		return domain.Loan{}, false, fmt.Errorf("mark loan lost: %w", err)
	}
	return toLoan(row), true, nil
}

func (r *Repository) RenewLoan(ctx context.Context, tenantID, id uuid.UUID, newDueOn time.Time) (domain.Loan, bool, error) {
	row, err := r.queries(ctx).RenewLoan(ctx, db.RenewLoanParams{TenantID: tenantID, ID: id, DueOn: pdatabase.Date(newDueOn)})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Loan{}, false, nil
	}
	if err != nil {
		return domain.Loan{}, false, fmt.Errorf("renew loan: %w", err)
	}
	return toLoan(row), true, nil
}

func (r *Repository) MarkLoanFinePaid(ctx context.Context, tenantID, id uuid.UUID, paidAt time.Time) (domain.Loan, bool, error) {
	row, err := r.queries(ctx).MarkLoanFinePaid(ctx, db.MarkLoanFinePaidParams{TenantID: tenantID, ID: id, FinePaidAt: pdatabase.Timestamptz(paidAt)})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Loan{}, false, nil
	}
	if err != nil {
		return domain.Loan{}, false, fmt.Errorf("mark fine paid: %w", err)
	}
	return toLoan(row), true, nil
}

func (r *Repository) ListLoansForMember(ctx context.Context, tenantID, memberID uuid.UUID, includeReturned bool, limit, offset int) ([]domain.Loan, error) {
	rows, err := r.queries(ctx).ListLoansForMember(ctx, db.ListLoansForMemberParams{
		TenantID: tenantID, MemberUserID: memberID, IncludeReturned: includeReturned, Limit: int32(limit), Offset: int32(offset), //nolint:gosec // clamped
	})
	if err != nil {
		return nil, fmt.Errorf("list loans for member: %w", err)
	}
	return toLoans(rows), nil
}

func (r *Repository) ListOverdueLoans(ctx context.Context, tenantID uuid.UUID, asOf time.Time) ([]domain.Loan, error) {
	rows, err := r.queries(ctx).ListOverdueLoans(ctx, db.ListOverdueLoansParams{TenantID: tenantID, DueOn: pdatabase.Date(asOf)})
	if err != nil {
		return nil, fmt.Errorf("list overdue loans: %w", err)
	}
	return toLoans(rows), nil
}

func (r *Repository) ListLoansInPeriod(ctx context.Context, tenantID uuid.UUID, from, to time.Time) ([]domain.Loan, error) {
	rows, err := r.queries(ctx).ListLoansInPeriod(ctx, db.ListLoansInPeriodParams{
		TenantID: tenantID, BorrowedAt: pdatabase.Timestamptz(from), BorrowedAt_2: pdatabase.Timestamptz(to),
	})
	if err != nil {
		return nil, fmt.Errorf("list loans in period: %w", err)
	}
	return toLoans(rows), nil
}

func (r *Repository) MostBorrowedTitles(ctx context.Context, tenantID uuid.UUID, from, to time.Time, limit int) ([]service.TitleLoanCount, error) {
	rows, err := r.queries(ctx).MostBorrowedTitles(ctx, db.MostBorrowedTitlesParams{
		TenantID: tenantID, BorrowedAt: pdatabase.Timestamptz(from), BorrowedAt_2: pdatabase.Timestamptz(to), Limit: int32(limit), //nolint:gosec // clamped
	})
	if err != nil {
		return nil, fmt.Errorf("most borrowed titles: %w", err)
	}
	out := make([]service.TitleLoanCount, len(rows))
	for i, row := range rows {
		out[i] = service.TitleLoanCount{TitleID: row.TitleID, LoanCount: int(row.LoanCount)}
	}
	return out, nil
}

func (r *Repository) CreateCirculationEvent(ctx context.Context, e domain.ItemEventRecord) (domain.ItemEventRecord, error) {
	row, err := r.queries(ctx).CreateCirculationEvent(ctx, db.CreateCirculationEventParams{
		TenantID: e.TenantID, CopyID: e.CopyID, LoanID: pdatabase.NullUUID(e.LoanID), MemberUserID: pdatabase.NullUUID(e.MemberUserID),
		EventType: string(e.EventType), Note: e.Notes, ActorUserID: pdatabase.NullUUID(e.CreatedBy),
	})
	if err != nil {
		return domain.ItemEventRecord{}, fmt.Errorf("create circulation event: %w", err)
	}
	return toItemEvent(row), nil
}

func (r *Repository) ListItemEventsForCopy(ctx context.Context, tenantID, copyID uuid.UUID) ([]domain.ItemEventRecord, error) {
	rows, err := r.queries(ctx).ListItemEventsForCopy(ctx, db.ListItemEventsForCopyParams{TenantID: tenantID, CopyID: copyID})
	if err != nil {
		return nil, fmt.Errorf("list item events for copy: %w", err)
	}
	out := make([]domain.ItemEventRecord, len(rows))
	for i, row := range rows {
		out[i] = toItemEvent(row)
	}
	return out, nil
}

func (r *Repository) CreateLoanRenewal(ctx context.Context, ren domain.LoanRenewal) (domain.LoanRenewal, error) {
	row, err := r.queries(ctx).CreateLoanRenewal(ctx, db.CreateLoanRenewalParams{
		TenantID: ren.TenantID, LoanID: ren.LoanID, RenewedAt: pdatabase.Timestamptz(ren.RenewedAt),
		PreviousDueOn: pdatabase.Date(ren.PreviousDueOn), NewDueOn: pdatabase.Date(ren.NewDueOn), RenewedBy: ren.RenewedBy,
	})
	if err != nil {
		return domain.LoanRenewal{}, fmt.Errorf("create loan renewal: %w", err)
	}
	return toLoanRenewal(row), nil
}

func (r *Repository) ListLoanRenewalsForLoan(ctx context.Context, tenantID, loanID uuid.UUID) ([]domain.LoanRenewal, error) {
	rows, err := r.queries(ctx).ListLoanRenewalsForLoan(ctx, db.ListLoanRenewalsForLoanParams{TenantID: tenantID, LoanID: loanID})
	if err != nil {
		return nil, fmt.Errorf("list loan renewals: %w", err)
	}
	out := make([]domain.LoanRenewal, len(rows))
	for i, row := range rows {
		out[i] = toLoanRenewal(row)
	}
	return out, nil
}

func (r *Repository) GetLoanByBarcode(ctx context.Context, tenantID uuid.UUID, barcode string) (domain.Loan, bool, error) {
	row, err := r.queries(ctx).GetLoanByBarcode(ctx, db.GetLoanByBarcodeParams{TenantID: tenantID, Barcode: barcode})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Loan{}, false, nil
	}
	if err != nil {
		return domain.Loan{}, false, fmt.Errorf("get loan by barcode: %w", err)
	}
	return toLoan(row), true, nil
}

func toLoans(rows []db.LibraryLoan) []domain.Loan {
	out := make([]domain.Loan, len(rows))
	for i, row := range rows {
		out[i] = toLoan(row)
	}
	return out
}
