// Package repository is the sqlc-backed implementation of the visitors
// service's data boundary.
package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/visitors/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/visitors/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

type Repository struct{ pool *pgxpool.Pool }

func New(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

var _ service.Repository = (*Repository)(nil)

func (r *Repository) queries(ctx context.Context) *db.Queries {
	if tx, ok := pdatabase.TxFromContext(ctx); ok {
		return db.New(tx)
	}
	return db.New(r.pool)
}

// Expected guests.

func (r *Repository) CreateExpectedGuest(ctx context.Context, g domain.ExpectedGuest) (domain.ExpectedGuest, error) {
	row, err := r.queries(ctx).CreateExpectedGuest(ctx, db.CreateExpectedGuestParams{
		TenantID: g.TenantID, FullName: g.FullName, Organization: g.Organization, HostUserID: g.HostUserID,
		Purpose: g.Purpose, ExpectedDate: pdatabase.Date(g.ExpectedDate), Notes: g.Notes, CreatedBy: g.CreatedBy,
	})
	if err != nil {
		return domain.ExpectedGuest{}, fmt.Errorf("create expected guest: %w", err)
	}
	return toExpectedGuest(row), nil
}

func (r *Repository) GetExpectedGuest(ctx context.Context, tenantID, id uuid.UUID) (domain.ExpectedGuest, bool, error) {
	row, err := r.queries(ctx).GetExpectedGuest(ctx, db.GetExpectedGuestParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ExpectedGuest{}, false, nil
	}
	if err != nil {
		return domain.ExpectedGuest{}, false, fmt.Errorf("get expected guest: %w", err)
	}
	return toExpectedGuest(row), true, nil
}

func (r *Repository) ListExpectedGuests(ctx context.Context, tenantID uuid.UUID, date time.Time, includeResolved bool) ([]domain.ExpectedGuest, error) {
	rows, err := r.queries(ctx).ListExpectedGuests(ctx, db.ListExpectedGuestsParams{
		TenantID: tenantID, ExpectedDate: pdatabase.Date(date), IncludeResolved: includeResolved,
	})
	if err != nil {
		return nil, fmt.Errorf("list expected guests: %w", err)
	}
	out := make([]domain.ExpectedGuest, len(rows))
	for i, row := range rows {
		out[i] = toExpectedGuest(row)
	}
	return out, nil
}

func (r *Repository) SetExpectedGuestStatus(ctx context.Context, tenantID, id uuid.UUID, status domain.ExpectedStatus) (domain.ExpectedGuest, bool, error) {
	row, err := r.queries(ctx).SetExpectedGuestStatus(ctx, db.SetExpectedGuestStatusParams{TenantID: tenantID, ID: id, Status: string(status)})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ExpectedGuest{}, false, nil
	}
	if err != nil {
		return domain.ExpectedGuest{}, false, fmt.Errorf("set expected guest status: %w", err)
	}
	return toExpectedGuest(row), true, nil
}

func (r *Repository) CancelExpectedGuest(ctx context.Context, tenantID, id uuid.UUID) error {
	if err := r.queries(ctx).CancelExpectedGuest(ctx, db.CancelExpectedGuestParams{TenantID: tenantID, ID: id}); err != nil {
		return fmt.Errorf("cancel expected guest: %w", err)
	}
	return nil
}

// Visits.

func (r *Repository) CreateVisit(ctx context.Context, v domain.Visit) (domain.Visit, error) {
	row, err := r.queries(ctx).CreateVisit(ctx, db.CreateVisitParams{
		TenantID: v.TenantID, ExpectedGuestID: pdatabase.NullUUID(v.ExpectedGuestID), FullName: v.FullName, Organization: v.Organization,
		HostUserID: v.HostUserID, Purpose: v.Purpose, IDChecked: v.IDChecked, IDType: string(v.IDType),
		BadgeNumber: v.BadgeNumber, BadgeAssetID: pdatabase.NullUUID(v.BadgeAssetID), ArrivedAt: pdatabase.Timestamptz(v.ArrivedAt), CheckedInBy: v.CheckedInBy,
	})
	if err != nil {
		return domain.Visit{}, fmt.Errorf("create visit: %w", err)
	}
	return toVisit(row), nil
}

func (r *Repository) GetVisit(ctx context.Context, tenantID, id uuid.UUID) (domain.Visit, bool, error) {
	row, err := r.queries(ctx).GetVisit(ctx, db.GetVisitParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Visit{}, false, nil
	}
	if err != nil {
		return domain.Visit{}, false, fmt.Errorf("get visit: %w", err)
	}
	return toVisit(row), true, nil
}

func (r *Repository) CheckOutVisit(ctx context.Context, tenantID, id uuid.UUID, departedAt time.Time, checkedOutBy uuid.UUID) (domain.Visit, bool, error) {
	row, err := r.queries(ctx).CheckOutVisit(ctx, db.CheckOutVisitParams{
		TenantID: tenantID, ID: id, DepartedAt: pdatabase.Timestamptz(departedAt), CheckedOutBy: pdatabase.NullUUID(uuid.NullUUID{UUID: checkedOutBy, Valid: true}),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Visit{}, false, nil
	}
	if err != nil {
		return domain.Visit{}, false, fmt.Errorf("check out visit: %w", err)
	}
	return toVisit(row), true, nil
}

func (r *Repository) ListOnCampus(ctx context.Context, tenantID uuid.UUID) ([]domain.Visit, error) {
	rows, err := r.queries(ctx).ListOnCampus(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list on campus: %w", err)
	}
	out := make([]domain.Visit, len(rows))
	for i, row := range rows {
		out[i] = toVisit(row)
	}
	return out, nil
}

func (r *Repository) ListVisits(ctx context.Context, tenantID uuid.UUID, from, to time.Time, limit, offset int) ([]domain.Visit, error) {
	rows, err := r.queries(ctx).ListVisits(ctx, db.ListVisitsParams{
		TenantID: tenantID, ArrivedAt: pdatabase.Timestamptz(from), ArrivedAt_2: pdatabase.Timestamptz(to),
		Limit: int32(limit), Offset: int32(offset), //nolint:gosec // clamped by the service
	})
	if err != nil {
		return nil, fmt.Errorf("list visits: %w", err)
	}
	out := make([]domain.Visit, len(rows))
	for i, row := range rows {
		out[i] = toVisit(row)
	}
	return out, nil
}

func (r *Repository) VisitRecap(ctx context.Context, tenantID uuid.UUID, from, to time.Time) (service.VisitRecapCounts, error) {
	q := r.queries(ctx)
	fromTS, toTS := pdatabase.Timestamptz(from), pdatabase.Timestamptz(to)
	total, err := q.CountVisitsInRange(ctx, db.CountVisitsInRangeParams{TenantID: tenantID, ArrivedAt: fromTS, ArrivedAt_2: toTS})
	if err != nil {
		return service.VisitRecapCounts{}, fmt.Errorf("count visits: %w", err)
	}
	stillOn, err := q.CountStillOnCampusInRange(ctx, db.CountStillOnCampusInRangeParams{TenantID: tenantID, ArrivedAt: fromTS, ArrivedAt_2: toTS})
	if err != nil {
		return service.VisitRecapCounts{}, fmt.Errorf("count still on campus: %w", err)
	}
	avg, err := q.AverageVisitMinutesInRange(ctx, db.AverageVisitMinutesInRangeParams{TenantID: tenantID, ArrivedAt: fromTS, ArrivedAt_2: toTS})
	if err != nil {
		return service.VisitRecapCounts{}, fmt.Errorf("average visit minutes: %w", err)
	}
	return service.VisitRecapCounts{TotalVisits: int(total), StillOnCampus: int(stillOn), AvgStayMinutes: avg}, nil
}

// Incidents.

func (r *Repository) CreateIncident(ctx context.Context, in domain.Incident) (domain.Incident, error) {
	row, err := r.queries(ctx).CreateIncident(ctx, db.CreateIncidentParams{
		TenantID: in.TenantID, OccurredAt: pdatabase.Timestamptz(in.OccurredAt), Severity: string(in.Severity),
		Description: in.Description, PersonsInvolved: in.PersonsInvolved, ActionTaken: in.ActionTaken, ReportedBy: in.ReportedBy,
	})
	if err != nil {
		return domain.Incident{}, fmt.Errorf("create incident: %w", err)
	}
	return toIncident(row), nil
}

func (r *Repository) GetIncident(ctx context.Context, tenantID, id uuid.UUID) (domain.Incident, bool, error) {
	row, err := r.queries(ctx).GetIncident(ctx, db.GetIncidentParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Incident{}, false, nil
	}
	if err != nil {
		return domain.Incident{}, false, fmt.Errorf("get incident: %w", err)
	}
	return toIncident(row), true, nil
}

func (r *Repository) UpdateIncident(ctx context.Context, in domain.Incident) (domain.Incident, bool, error) {
	row, err := r.queries(ctx).UpdateIncident(ctx, db.UpdateIncidentParams{
		TenantID: in.TenantID, ID: in.ID, Severity: string(in.Severity),
		Description: in.Description, PersonsInvolved: in.PersonsInvolved, ActionTaken: in.ActionTaken,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Incident{}, false, nil
	}
	if err != nil {
		return domain.Incident{}, false, fmt.Errorf("update incident: %w", err)
	}
	return toIncident(row), true, nil
}

func (r *Repository) CloseIncident(ctx context.Context, tenantID, id uuid.UUID, closedAt time.Time, closedBy uuid.UUID) (domain.Incident, bool, error) {
	row, err := r.queries(ctx).CloseIncident(ctx, db.CloseIncidentParams{
		TenantID: tenantID, ID: id, ClosedAt: pdatabase.Timestamptz(closedAt), ClosedBy: pdatabase.NullUUID(uuid.NullUUID{UUID: closedBy, Valid: true}),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Incident{}, false, nil
	}
	if err != nil {
		return domain.Incident{}, false, fmt.Errorf("close incident: %w", err)
	}
	return toIncident(row), true, nil
}

func (r *Repository) ListIncidents(ctx context.Context, tenantID uuid.UUID, from, to time.Time, includeClosed bool, limit, offset int) ([]domain.Incident, error) {
	rows, err := r.queries(ctx).ListIncidents(ctx, db.ListIncidentsParams{
		TenantID: tenantID, OccurredAt: pdatabase.Timestamptz(from), OccurredAt_2: pdatabase.Timestamptz(to),
		Limit: int32(limit), Offset: int32(offset), IncludeClosed: includeClosed, //nolint:gosec // clamped by the service
	})
	if err != nil {
		return nil, fmt.Errorf("list incidents: %w", err)
	}
	out := make([]domain.Incident, len(rows))
	for i, row := range rows {
		out[i] = toIncident(row)
	}
	return out, nil
}

func (r *Repository) IncidentSeverityCounts(ctx context.Context, tenantID uuid.UUID, from, to time.Time) (map[domain.Severity]int, error) {
	rows, err := r.queries(ctx).CountIncidentsBySeverityInRange(ctx, db.CountIncidentsBySeverityInRangeParams{
		TenantID: tenantID, OccurredAt: pdatabase.Timestamptz(from), OccurredAt_2: pdatabase.Timestamptz(to),
	})
	if err != nil {
		return nil, fmt.Errorf("count incidents by severity: %w", err)
	}
	out := make(map[domain.Severity]int, len(rows))
	for _, row := range rows {
		out[domain.Severity(row.Severity)] = int(row.Total)
	}
	return out, nil
}

// Cross-module.

func (r *Repository) HasActiveDuty(ctx context.Context, tenantID, yearID, userID uuid.UUID, slug string) (bool, error) {
	return r.queries(ctx).VisitorsHasActiveDuty(ctx, db.VisitorsHasActiveDutyParams{TenantID: tenantID, AcademicYearID: yearID, UserID: userID, Slug: slug})
}

func toExpectedGuest(row db.VisitorExpectedGuest) domain.ExpectedGuest {
	return domain.ExpectedGuest{
		ID: row.ID, TenantID: row.TenantID, FullName: row.FullName, Organization: row.Organization, HostUserID: row.HostUserID,
		Purpose: row.Purpose, ExpectedDate: pdatabase.DateOrZero(row.ExpectedDate), Notes: row.Notes, Status: domain.ExpectedStatus(row.Status),
		CreatedBy: row.CreatedBy, CreatedAt: pdatabase.TimeOrZero(row.CreatedAt), UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt),
	}
}

func toVisit(row db.VisitorVisit) domain.Visit {
	return domain.Visit{
		ID: row.ID, TenantID: row.TenantID, ExpectedGuestID: pdatabase.UUIDOrNil(row.ExpectedGuestID),
		FullName: row.FullName, Organization: row.Organization, HostUserID: row.HostUserID, Purpose: row.Purpose,
		IDChecked: row.IDChecked, IDType: domain.IdentificationType(row.IDType), BadgeNumber: row.BadgeNumber,
		BadgeAssetID: pdatabase.UUIDOrNil(row.BadgeAssetID), ArrivedAt: pdatabase.TimeOrZero(row.ArrivedAt), DepartedAt: pdatabase.TimePtr(row.DepartedAt),
		CheckedInBy: row.CheckedInBy, CheckedOutBy: pdatabase.UUIDOrNil(row.CheckedOutBy),
		CreatedAt: pdatabase.TimeOrZero(row.CreatedAt), UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt),
	}
}

func toIncident(row db.VisitorIncident) domain.Incident {
	return domain.Incident{
		ID: row.ID, TenantID: row.TenantID, OccurredAt: pdatabase.TimeOrZero(row.OccurredAt), Severity: domain.Severity(row.Severity),
		Description: row.Description, PersonsInvolved: row.PersonsInvolved, ActionTaken: row.ActionTaken, ReportedBy: row.ReportedBy,
		IsClosed: row.IsClosed, ClosedAt: pdatabase.TimePtr(row.ClosedAt), ClosedBy: pdatabase.UUIDOrNil(row.ClosedBy),
		CreatedAt: pdatabase.TimeOrZero(row.CreatedAt), UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt),
	}
}
