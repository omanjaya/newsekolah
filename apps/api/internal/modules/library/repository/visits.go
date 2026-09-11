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

func (r *Repository) CreateVisit(ctx context.Context, v domain.Visit) (domain.Visit, error) {
	row, err := r.queries(ctx).CreateLibraryVisit(ctx, db.CreateLibraryVisitParams{
		TenantID: v.TenantID, MemberUserID: pdatabase.NullUUID(v.MemberUserID), VisitorName: v.VisitorName, Kind: string(v.Kind),
		Purpose: v.Purpose, GroupSize: int32(v.GroupSize), Source: string(v.Source), //nolint:gosec // validated positive
		VisitedAt: pdatabase.Timestamptz(v.VisitedAt), CreatedBy: pdatabase.NullUUID(v.CreatedBy),
	})
	if err != nil {
		return domain.Visit{}, fmt.Errorf("create visit: %w", err)
	}
	return toVisit(row), nil
}

func (r *Repository) GetLastVisitForMember(ctx context.Context, tenantID, memberID uuid.UUID) (domain.Visit, bool, error) {
	row, err := r.queries(ctx).GetLastVisitForMember(ctx, db.GetLastVisitForMemberParams{TenantID: tenantID, MemberUserID: pdatabase.NullUUID(uuid.NullUUID{UUID: memberID, Valid: true})})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Visit{}, false, nil
	}
	if err != nil {
		return domain.Visit{}, false, fmt.Errorf("get last visit for member: %w", err)
	}
	return toVisit(row), true, nil
}

func (r *Repository) ListVisitsForRange(ctx context.Context, tenantID uuid.UUID, from, to time.Time) ([]domain.Visit, error) {
	rows, err := r.queries(ctx).ListVisitsForRange(ctx, db.ListVisitsForRangeParams{TenantID: tenantID, VisitedAt: pdatabase.Timestamptz(from), VisitedAt_2: pdatabase.Timestamptz(to)})
	if err != nil {
		return nil, fmt.Errorf("list visits for range: %w", err)
	}
	return toVisits(rows), nil
}

func (r *Repository) TodayVisitSummary(ctx context.Context, tenantID uuid.UUID, from, to time.Time) (service.VisitSummary, error) {
	row, err := r.queries(ctx).TodayVisitSummary(ctx, db.TodayVisitSummaryParams{TenantID: tenantID, VisitedAt: pdatabase.Timestamptz(from), VisitedAt_2: pdatabase.Timestamptz(to)})
	if err != nil {
		return service.VisitSummary{}, fmt.Errorf("today visit summary: %w", err)
	}
	return service.VisitSummary{TotalVisits: int(row.TotalVisits), UniqueMembers: int(row.UniqueMembers), TotalPeople: int(row.TotalPeople)}, nil
}

func (r *Repository) CreateReadInPlace(ctx context.Context, p domain.ReadInPlace) (domain.ReadInPlace, error) {
	row, err := r.queries(ctx).CreateReadInPlace(ctx, db.CreateReadInPlaceParams{
		TenantID: p.TenantID, CopyID: p.CopyID, MemberUserID: pdatabase.NullUUID(p.MemberUserID), VisitorName: p.VisitorName,
		StartedAt: pdatabase.Timestamptz(p.StartedAt), CreatedBy: pdatabase.NullUUID(p.CreatedBy),
	})
	if err != nil {
		return domain.ReadInPlace{}, fmt.Errorf("create read in place: %w", err)
	}
	return toReadInPlace(row), nil
}

func (r *Repository) ListReadInPlaceForCopy(ctx context.Context, tenantID, copyID uuid.UUID) ([]domain.ReadInPlace, error) {
	rows, err := r.queries(ctx).ListReadInPlaceForCopy(ctx, db.ListReadInPlaceForCopyParams{TenantID: tenantID, CopyID: copyID})
	if err != nil {
		return nil, fmt.Errorf("list read in place for copy: %w", err)
	}
	out := make([]domain.ReadInPlace, len(rows))
	for i, row := range rows {
		out[i] = toReadInPlace(row)
	}
	return out, nil
}
