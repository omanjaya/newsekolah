package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func (r *Repository) CountActiveStudentsTotal(ctx context.Context, tenantID uuid.UUID) (int, error) {
	n, err := r.queries(ctx).CountActiveStudentsTotal(ctx, tenantID)
	if err != nil {
		return 0, fmt.Errorf("count active students total: %w", err)
	}
	return int(n), nil
}

func (r *Repository) CountMembersTotal(ctx context.Context, tenantID uuid.UUID) (int, error) {
	n, err := r.queries(ctx).CountMembersTotal(ctx, tenantID)
	if err != nil {
		return 0, fmt.Errorf("count members total: %w", err)
	}
	return int(n), nil
}

func (r *Repository) CountActiveMembersTotal(ctx context.Context, tenantID uuid.UUID) (int, error) {
	n, err := r.queries(ctx).CountActiveMembersTotal(ctx, tenantID)
	if err != nil {
		return 0, fmt.Errorf("count active members total: %w", err)
	}
	return int(n), nil
}

func (r *Repository) CountVisitsBetween(ctx context.Context, tenantID uuid.UUID, from, to time.Time) (int, error) {
	n, err := r.queries(ctx).CountVisitsBetween(ctx, db.CountVisitsBetweenParams{
		TenantID: tenantID, VisitedAt: pdatabase.Timestamptz(from), VisitedAt_2: pdatabase.Timestamptz(to),
	})
	if err != nil {
		return 0, fmt.Errorf("count visits between: %w", err)
	}
	return int(n), nil
}

func (r *Repository) CountCopiesAddedInPeriod(ctx context.Context, tenantID uuid.UUID, from, to time.Time) (int, error) {
	n, err := r.queries(ctx).CountCopiesAddedInPeriod(ctx, db.CountCopiesAddedInPeriodParams{
		TenantID: tenantID, CreatedAt: pdatabase.Timestamptz(from), CreatedAt_2: pdatabase.Timestamptz(to),
	})
	if err != nil {
		return 0, fmt.Errorf("count copies added in period: %w", err)
	}
	return int(n), nil
}

func (r *Repository) CountLateReturnsBetween(ctx context.Context, tenantID uuid.UUID, from, to time.Time) (int, error) {
	n, err := r.queries(ctx).CountLateReturnsBetween(ctx, db.CountLateReturnsBetweenParams{
		TenantID: tenantID, ReturnedAt: pdatabase.Timestamptz(from), ReturnedAt_2: pdatabase.Timestamptz(to),
	})
	if err != nil {
		return 0, fmt.Errorf("count late returns between: %w", err)
	}
	return int(n), nil
}

func (r *Repository) SumFinesRecordedBetween(ctx context.Context, tenantID uuid.UUID, from, to time.Time) (int, error) {
	n, err := r.queries(ctx).SumFinesRecordedBetween(ctx, db.SumFinesRecordedBetweenParams{
		TenantID: tenantID, ReturnedAt: pdatabase.Timestamptz(from), ReturnedAt_2: pdatabase.Timestamptz(to),
	})
	if err != nil {
		return 0, fmt.Errorf("sum fines recorded between: %w", err)
	}
	return int(n), nil
}

func (r *Repository) VisitsPerDay(ctx context.Context, tenantID uuid.UUID, from, to time.Time) ([]service.DaySeriesPoint, error) {
	rows, err := r.queries(ctx).VisitsPerDay(ctx, db.VisitsPerDayParams{
		TenantID: tenantID, VisitedAt: pdatabase.Timestamptz(from), VisitedAt_2: pdatabase.Timestamptz(to),
	})
	if err != nil {
		return nil, fmt.Errorf("visits per day: %w", err)
	}
	out := make([]service.DaySeriesPoint, len(rows))
	for i, row := range rows {
		out[i] = service.DaySeriesPoint{Day: pdatabase.DateOrZero(row.Day), Count: int(row.VisitCount)}
	}
	return out, nil
}

func (r *Repository) VisitsPerClass(ctx context.Context, tenantID uuid.UUID, from, to time.Time) ([]service.ClassCount, error) {
	rows, err := r.queries(ctx).VisitsPerClass(ctx, db.VisitsPerClassParams{
		TenantID: tenantID, VisitedAt: pdatabase.Timestamptz(from), VisitedAt_2: pdatabase.Timestamptz(to),
	})
	if err != nil {
		return nil, fmt.Errorf("visits per class: %w", err)
	}
	out := make([]service.ClassCount, len(rows))
	for i, row := range rows {
		out[i] = service.ClassCount{ClassName: row.ClassName, Count: int(row.VisitCount)}
	}
	return out, nil
}

func (r *Repository) MembersByType(ctx context.Context, tenantID uuid.UUID) ([]service.MemberTypeCount, error) {
	rows, err := r.queries(ctx).MembersByType(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("members by type: %w", err)
	}
	out := make([]service.MemberTypeCount, len(rows))
	for i, row := range rows {
		out[i] = service.MemberTypeCount{ID: row.ID, Name: row.Name, Count: int(row.MemberCount)}
	}
	return out, nil
}

func (r *Repository) MembersByClass(ctx context.Context, tenantID uuid.UUID) ([]service.ClassCount, error) {
	rows, err := r.queries(ctx).MembersByClass(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("members by class: %w", err)
	}
	out := make([]service.ClassCount, len(rows))
	for i, row := range rows {
		out[i] = service.ClassCount{ClassName: row.ClassName, Count: int(row.MemberCount)}
	}
	return out, nil
}

func (r *Repository) ListTitlesForExport(ctx context.Context, tenantID uuid.UUID) ([]service.TitleExportRow, error) {
	rows, err := r.queries(ctx).ListTitlesForExport(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list titles for export: %w", err)
	}
	out := make([]service.TitleExportRow, len(rows))
	for i, row := range rows {
		out[i] = service.TitleExportRow{
			Title: toTitle(row.LibraryTitle), MaterialTypeCode: row.MaterialTypeCode,
			TotalCopies: int(row.TotalCopies), AvailableCopies: int(row.AvailableCopies),
		}
	}
	return out, nil
}

func (r *Repository) ListCopiesForExport(ctx context.Context, tenantID uuid.UUID) ([]service.CopyExportRow, error) {
	rows, err := r.queries(ctx).ListCopiesForExport(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list copies for export: %w", err)
	}
	out := make([]service.CopyExportRow, len(rows))
	for i, row := range rows {
		out[i] = service.CopyExportRow{
			Copy: toCopy(row.LibraryCopy), TitleName: row.TitleName, TitleAuthor: row.TitleAuthor,
			CategoryName: row.CategoryName, LocationName: row.LocationName, SourceName: row.SourceName,
		}
	}
	return out, nil
}

func (r *Repository) TopBorrowersInPeriod(ctx context.Context, tenantID uuid.UUID, from, to time.Time, limit int) ([]service.BorrowerCount, error) {
	rows, err := r.queries(ctx).TopBorrowersInPeriod(ctx, db.TopBorrowersInPeriodParams{
		TenantID: tenantID, BorrowedAt: pdatabase.Timestamptz(from), BorrowedAt_2: pdatabase.Timestamptz(to), Limit: int32(limit), //nolint:gosec // clamped by service
	})
	if err != nil {
		return nil, fmt.Errorf("top borrowers in period: %w", err)
	}
	out := make([]service.BorrowerCount, len(rows))
	for i, row := range rows {
		out[i] = service.BorrowerCount{MemberUserID: row.MemberUserID, ClassName: row.ClassName, LoanCount: int(row.LoanCount)}
	}
	return out, nil
}
