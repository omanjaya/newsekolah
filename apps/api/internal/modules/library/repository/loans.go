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
	row, err := r.queries(ctx).CreateLoan(ctx, db.CreateLoanParams{
		TenantID: l.TenantID, CopyID: l.CopyID, TitleID: l.TitleID, MemberUserID: l.MemberUserID, CheckedOutBy: l.CheckedOutBy,
		BorrowedAt: pdatabase.Timestamptz(l.BorrowedAt), DueOn: pdatabase.Date(l.DueOn),
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

func toLoans(rows []db.LibraryLoan) []domain.Loan {
	out := make([]domain.Loan, len(rows))
	for i, row := range rows {
		out[i] = toLoan(row)
	}
	return out
}
