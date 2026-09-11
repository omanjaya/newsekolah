package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func (r *Repository) CountTitlesActive(ctx context.Context, tenantID uuid.UUID) (int, error) {
	n, err := r.queries(ctx).CountTitlesActive(ctx, tenantID)
	if err != nil {
		return 0, fmt.Errorf("count titles active: %w", err)
	}
	return int(n), nil
}

func (r *Repository) CountCopiesTotal(ctx context.Context, tenantID uuid.UUID) (int, error) {
	n, err := r.queries(ctx).CountCopiesTotal(ctx, tenantID)
	if err != nil {
		return 0, fmt.Errorf("count copies total: %w", err)
	}
	return int(n), nil
}

func (r *Repository) CountCopiesByStatus(ctx context.Context, tenantID uuid.UUID, status domain.CopyStatus) (int, error) {
	n, err := r.queries(ctx).CountCopiesByStatus(ctx, db.CountCopiesByStatusParams{TenantID: tenantID, Status: string(status)})
	if err != nil {
		return 0, fmt.Errorf("count copies by status: %w", err)
	}
	return int(n), nil
}

func (r *Repository) CountLoansBetween(ctx context.Context, tenantID uuid.UUID, from, to time.Time) (int, error) {
	n, err := r.queries(ctx).CountLoansBetween(ctx, db.CountLoansBetweenParams{TenantID: tenantID, BorrowedAt: pdatabase.Timestamptz(from), BorrowedAt_2: pdatabase.Timestamptz(to)})
	if err != nil {
		return 0, fmt.Errorf("count loans between: %w", err)
	}
	return int(n), nil
}

func (r *Repository) CountReturnsBetween(ctx context.Context, tenantID uuid.UUID, from, to time.Time) (int, error) {
	n, err := r.queries(ctx).CountReturnsBetween(ctx, db.CountReturnsBetweenParams{TenantID: tenantID, ReturnedAt: pdatabase.Timestamptz(from), ReturnedAt_2: pdatabase.Timestamptz(to)})
	if err != nil {
		return 0, fmt.Errorf("count returns between: %w", err)
	}
	return int(n), nil
}

func (r *Repository) SumUnpaidFines(ctx context.Context, tenantID uuid.UUID) (int, error) {
	n, err := r.queries(ctx).SumUnpaidFines(ctx, tenantID)
	if err != nil {
		return 0, fmt.Errorf("sum unpaid fines: %w", err)
	}
	return int(n), nil
}

func (r *Repository) ListLatestLoans(ctx context.Context, tenantID uuid.UUID, limit int) ([]domain.Loan, error) {
	rows, err := r.queries(ctx).ListLatestLoans(ctx, db.ListLatestLoansParams{TenantID: tenantID, Limit: int32(limit)}) //nolint:gosec // clamped by service
	if err != nil {
		return nil, fmt.Errorf("list latest loans: %w", err)
	}
	out := make([]domain.Loan, len(rows))
	for i, row := range rows {
		out[i] = toLoan(row)
	}
	return out, nil
}

func (r *Repository) ListLongestOverdueLoans(ctx context.Context, tenantID uuid.UUID, asOf time.Time, limit int) ([]domain.Loan, error) {
	rows, err := r.queries(ctx).ListLongestOverdueLoans(ctx, db.ListLongestOverdueLoansParams{TenantID: tenantID, DueOn: pdatabase.Date(asOf), Limit: int32(limit)}) //nolint:gosec // clamped by service
	if err != nil {
		return nil, fmt.Errorf("list longest overdue loans: %w", err)
	}
	out := make([]domain.Loan, len(rows))
	for i, row := range rows {
		out[i] = toLoan(row)
	}
	return out, nil
}

func (r *Repository) PopularTitlesAllTime(ctx context.Context, tenantID uuid.UUID, limit int) ([]service.TitleLoanCount, error) {
	rows, err := r.queries(ctx).PopularTitlesAllTime(ctx, db.PopularTitlesAllTimeParams{TenantID: tenantID, Limit: int32(limit)}) //nolint:gosec // clamped by service
	if err != nil {
		return nil, fmt.Errorf("popular titles all time: %w", err)
	}
	out := make([]service.TitleLoanCount, len(rows))
	for i, row := range rows {
		out[i] = service.TitleLoanCount{TitleID: row.TitleID, LoanCount: int(row.LoanCount)}
	}
	return out, nil
}

func (r *Repository) DailyLoansSeries(ctx context.Context, tenantID uuid.UUID, since time.Time) ([]service.DaySeriesPoint, error) {
	rows, err := r.queries(ctx).DailyLoansSeries(ctx, db.DailyLoansSeriesParams{TenantID: tenantID, BorrowedAt: pdatabase.Timestamptz(since)})
	if err != nil {
		return nil, fmt.Errorf("daily loans series: %w", err)
	}
	out := make([]service.DaySeriesPoint, len(rows))
	for i, row := range rows {
		out[i] = service.DaySeriesPoint{Day: pdatabase.DateOrZero(row.Day), Count: int(row.LoanCount)}
	}
	return out, nil
}

func (r *Repository) DailyReturnsSeries(ctx context.Context, tenantID uuid.UUID, since time.Time) ([]service.DaySeriesPoint, error) {
	rows, err := r.queries(ctx).DailyReturnsSeries(ctx, db.DailyReturnsSeriesParams{TenantID: tenantID, ReturnedAt: pdatabase.Timestamptz(since)})
	if err != nil {
		return nil, fmt.Errorf("daily returns series: %w", err)
	}
	out := make([]service.DaySeriesPoint, len(rows))
	for i, row := range rows {
		out[i] = service.DaySeriesPoint{Day: pdatabase.DateOrZero(row.Day), Count: int(row.ReturnCount)}
	}
	return out, nil
}
