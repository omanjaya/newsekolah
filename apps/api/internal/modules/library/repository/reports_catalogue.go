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

func (r *Repository) TitlesByDDCClass(ctx context.Context, tenantID uuid.UUID) ([]service.DDCClassCount, error) {
	rows, err := r.queries(ctx).TitlesByDDCClass(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("titles by ddc class: %w", err)
	}
	out := make([]service.DDCClassCount, len(rows))
	for i, row := range rows {
		out[i] = service.DDCClassCount{Code: row.Code, Name: row.Name, TitleCount: int(row.TitleCount)}
	}
	return out, nil
}

func (r *Repository) ItemsByCategory(ctx context.Context, tenantID uuid.UUID) ([]service.MasterEntryCount, error) {
	rows, err := r.queries(ctx).ItemsByCategory(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("items by category: %w", err)
	}
	out := make([]service.MasterEntryCount, len(rows))
	for i, row := range rows {
		out[i] = service.MasterEntryCount{ID: row.ID, Code: row.Code, Name: row.Name, Count: int(row.ItemCount)}
	}
	return out, nil
}

func (r *Repository) ItemsByMaterialType(ctx context.Context, tenantID uuid.UUID) ([]service.MasterEntryCount, error) {
	rows, err := r.queries(ctx).ItemsByMaterialType(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("items by material type: %w", err)
	}
	out := make([]service.MasterEntryCount, len(rows))
	for i, row := range rows {
		out[i] = service.MasterEntryCount{ID: row.ID, Code: row.Code, Name: row.Name, Count: int(row.TitleCount)}
	}
	return out, nil
}

func (r *Repository) FictionRatioCounts(ctx context.Context, tenantID uuid.UUID) (fiction, total int, err error) {
	row, err := r.queries(ctx).FictionRatioCounts(ctx, tenantID)
	if err != nil {
		return 0, 0, fmt.Errorf("fiction ratio counts: %w", err)
	}
	return int(row.FictionCount), int(row.TotalCount), nil
}

func (r *Repository) CountTitlesAddedInPeriod(ctx context.Context, tenantID uuid.UUID, from, to time.Time) (int, error) {
	n, err := r.queries(ctx).CountTitlesAddedInPeriod(ctx, db.CountTitlesAddedInPeriodParams{
		TenantID: tenantID, CreatedAt: pdatabase.Timestamptz(from), CreatedAt_2: pdatabase.Timestamptz(to),
	})
	if err != nil {
		return 0, fmt.Errorf("count titles added in period: %w", err)
	}
	return int(n), nil
}

func (r *Repository) CountActiveBorrowers(ctx context.Context, tenantID uuid.UUID) (int, error) {
	n, err := r.queries(ctx).CountActiveBorrowers(ctx, tenantID)
	if err != nil {
		return 0, fmt.Errorf("count active borrowers: %w", err)
	}
	return int(n), nil
}

func (r *Repository) CountOverdueNow(ctx context.Context, tenantID uuid.UUID, asOf time.Time) (int, error) {
	n, err := r.queries(ctx).CountOverdueNow(ctx, db.CountOverdueNowParams{TenantID: tenantID, DueOn: pdatabase.Date(asOf)})
	if err != nil {
		return 0, fmt.Errorf("count overdue now: %w", err)
	}
	return int(n), nil
}

func (r *Repository) GetLastClosedStocktake(ctx context.Context, tenantID uuid.UUID) (domain.Stocktake, bool, error) {
	row, err := r.queries(ctx).GetLastClosedStocktake(ctx, tenantID)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Stocktake{}, false, nil
	}
	if err != nil {
		return domain.Stocktake{}, false, fmt.Errorf("get last closed stocktake: %w", err)
	}
	return toStocktake(row), true, nil
}

func (r *Repository) ListCopiesAcquiredInPeriod(ctx context.Context, tenantID uuid.UUID, from, to time.Time) ([]domain.Copy, error) {
	rows, err := r.queries(ctx).ListCopiesAcquiredInPeriod(ctx, db.ListCopiesAcquiredInPeriodParams{
		TenantID: tenantID, AcquiredOn: pdatabase.Date(from), AcquiredOn_2: pdatabase.Date(to),
	})
	if err != nil {
		return nil, fmt.Errorf("list copies acquired in period: %w", err)
	}
	out := make([]domain.Copy, len(rows))
	for i, row := range rows {
		out[i] = toCopy(row)
	}
	return out, nil
}

func (r *Repository) ListLoansInPeriodWithTitle(ctx context.Context, tenantID uuid.UUID, from, to time.Time) ([]service.LoanTitleRow, error) {
	rows, err := r.queries(ctx).ListLoansInPeriodWithTitle(ctx, db.ListLoansInPeriodWithTitleParams{
		TenantID: tenantID, BorrowedAt: pdatabase.Timestamptz(from), BorrowedAt_2: pdatabase.Timestamptz(to),
	})
	if err != nil {
		return nil, fmt.Errorf("list loans in period with title: %w", err)
	}
	out := make([]service.LoanTitleRow, len(rows))
	for i, row := range rows {
		out[i] = service.LoanTitleRow{
			Loan: toLoan(db.LibraryLoan{
				ID: row.ID, TenantID: row.TenantID, CopyID: row.CopyID, TitleID: row.TitleID, MemberUserID: row.MemberUserID,
				CheckedOutBy: row.CheckedOutBy, BorrowedAt: row.BorrowedAt, DueOn: row.DueOn, ReturnedAt: row.ReturnedAt,
				CheckedInBy: row.CheckedInBy, RenewalCount: row.RenewalCount, Status: row.Status, FineAmount: row.FineAmount,
				FinePaidAt: row.FinePaidAt, ActiveCopyID: row.ActiveCopyID, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
			}),
			Title: row.TitleName,
		}
	}
	return out, nil
}
