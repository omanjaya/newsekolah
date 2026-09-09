// Package repository is the sqlc-backed implementation of the reports
// module's schedule data boundary.
package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/reports/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/reports/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

// ScheduleRepository implements service.ScheduleRepository. It is a
// distinct type from the reports module's other repository (there is none
// today; the catalogue has no storage of its own) so the schedule feature
// can be constructed independently in wiring.
type ScheduleRepository struct{ pool *pgxpool.Pool }

func NewSchedule(pool *pgxpool.Pool) *ScheduleRepository { return &ScheduleRepository{pool: pool} }

var _ service.ScheduleRepository = (*ScheduleRepository)(nil)

func (r *ScheduleRepository) queries(ctx context.Context) *db.Queries {
	if tx, ok := pdatabase.TxFromContext(ctx); ok {
		return db.New(tx)
	}
	return db.New(r.pool)
}

func (r *ScheduleRepository) CreateSchedule(ctx context.Context, s domain.Schedule) (domain.Schedule, error) {
	params, err := marshalParams(s.Params)
	if err != nil {
		return domain.Schedule{}, fmt.Errorf("marshal schedule params: %w", err)
	}
	row, err := r.queries(ctx).CreateReportSchedule(ctx, db.CreateReportScheduleParams{
		TenantID: s.TenantID, ReportKind: s.ReportKind, Params: params, Cadence: string(s.Cadence),
		Weekday: int2FromPtr(s.Weekday), DayOfMonth: int2FromPtr(s.DayOfMonth),
		Hour: int16(s.Hour), Recipients: s.Recipients, Enabled: s.Enabled, CreatedBy: s.CreatedBy, //nolint:gosec // validated 0-23
	})
	if err != nil {
		return domain.Schedule{}, fmt.Errorf("create report schedule: %w", err)
	}
	return toSchedule(row), nil
}

func (r *ScheduleRepository) UpdateSchedule(ctx context.Context, s domain.Schedule) (domain.Schedule, error) {
	params, err := marshalParams(s.Params)
	if err != nil {
		return domain.Schedule{}, fmt.Errorf("marshal schedule params: %w", err)
	}
	row, err := r.queries(ctx).UpdateReportSchedule(ctx, db.UpdateReportScheduleParams{
		TenantID: s.TenantID, ID: s.ID, ReportKind: s.ReportKind, Params: params, Cadence: string(s.Cadence),
		Weekday: int2FromPtr(s.Weekday), DayOfMonth: int2FromPtr(s.DayOfMonth),
		Hour: int16(s.Hour), Recipients: s.Recipients, //nolint:gosec // validated 0-23
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Schedule{}, domain.ErrScheduleNotFound
	}
	if err != nil {
		return domain.Schedule{}, fmt.Errorf("update report schedule: %w", err)
	}
	return toSchedule(row), nil
}

func (r *ScheduleRepository) SetEnabled(ctx context.Context, tenantID, id uuid.UUID, enabled bool) (domain.Schedule, error) {
	row, err := r.queries(ctx).SetReportScheduleEnabled(ctx, db.SetReportScheduleEnabledParams{
		TenantID: tenantID, ID: id, Enabled: enabled,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Schedule{}, domain.ErrScheduleNotFound
	}
	if err != nil {
		return domain.Schedule{}, fmt.Errorf("set report schedule enabled: %w", err)
	}
	return toSchedule(row), nil
}

func (r *ScheduleRepository) GetSchedule(ctx context.Context, tenantID, id uuid.UUID) (domain.Schedule, bool, error) {
	row, err := r.queries(ctx).GetReportSchedule(ctx, db.GetReportScheduleParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Schedule{}, false, nil
	}
	if err != nil {
		return domain.Schedule{}, false, fmt.Errorf("get report schedule: %w", err)
	}
	return toSchedule(row), true, nil
}

func (r *ScheduleRepository) ListSchedules(ctx context.Context, tenantID uuid.UUID) ([]domain.Schedule, error) {
	rows, err := r.queries(ctx).ListReportSchedules(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list report schedules: %w", err)
	}
	out := make([]domain.Schedule, len(rows))
	for i, row := range rows {
		out[i] = toSchedule(row)
	}
	return out, nil
}

func (r *ScheduleRepository) DeleteSchedule(ctx context.Context, tenantID, id uuid.UUID) error {
	if err := r.queries(ctx).DeleteReportSchedule(ctx, db.DeleteReportScheduleParams{TenantID: tenantID, ID: id}); err != nil {
		return fmt.Errorf("delete report schedule: %w", err)
	}
	return nil
}

func (r *ScheduleRepository) ListEnabledSchedulesForTenantHour(ctx context.Context, tenantID uuid.UUID, hour int) ([]domain.Schedule, error) {
	rows, err := r.queries(ctx).ListEnabledReportSchedulesForHour(ctx, db.ListEnabledReportSchedulesForHourParams{
		TenantID: tenantID, Hour: int16(hour), //nolint:gosec // caller passes time.Time.Hour(), 0-23
	})
	if err != nil {
		return nil, fmt.Errorf("list enabled report schedules for hour: %w", err)
	}
	out := make([]domain.Schedule, len(rows))
	for i, row := range rows {
		out[i] = toSchedule(row)
	}
	return out, nil
}

func (r *ScheduleRepository) ClaimRun(ctx context.Context, tenantID, scheduleID uuid.UUID, dueAt time.Time) (domain.Run, bool, error) {
	row, err := r.queries(ctx).ClaimReportScheduleRun(ctx, db.ClaimReportScheduleRunParams{
		TenantID: tenantID, ScheduleID: scheduleID, DueAt: pdatabase.Timestamptz(dueAt),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Run{}, false, nil
	}
	if err != nil {
		return domain.Run{}, false, fmt.Errorf("claim report schedule run: %w", err)
	}
	return toRun(row), true, nil
}

func (r *ScheduleRepository) CompleteRun(ctx context.Context, tenantID, runID uuid.UUID, status domain.RunStatus, errMsg, objectKey string, ranAt time.Time) error {
	err := r.queries(ctx).CompleteReportScheduleRun(ctx, db.CompleteReportScheduleRunParams{
		TenantID: tenantID, ID: runID, Status: string(status), ErrorMessage: errMsg, ObjectKey: objectKey,
		RanAt: pdatabase.Timestamptz(ranAt),
	})
	if err != nil {
		return fmt.Errorf("complete report schedule run: %w", err)
	}
	return nil
}

func (r *ScheduleRepository) ListRuns(ctx context.Context, tenantID, scheduleID uuid.UUID, limit int) ([]domain.Run, error) {
	rows, err := r.queries(ctx).ListReportScheduleRuns(ctx, db.ListReportScheduleRunsParams{
		TenantID: tenantID, ScheduleID: scheduleID, Limit: int32(limit), //nolint:gosec // bounded by the service to <= 200
	})
	if err != nil {
		return nil, fmt.Errorf("list report schedule runs: %w", err)
	}
	out := make([]domain.Run, len(rows))
	for i, row := range rows {
		out[i] = toRun(row)
	}
	return out, nil
}

func (r *ScheduleRepository) ListActiveTenants(ctx context.Context) ([]service.TenantRef, error) {
	rows, err := r.queries(ctx).ListActiveTenantsForReportSchedules(ctx)
	if err != nil {
		return nil, fmt.Errorf("list active tenants: %w", err)
	}
	out := make([]service.TenantRef, len(rows))
	for i, row := range rows {
		out[i] = service.TenantRef{ID: row.ID, Timezone: row.Timezone}
	}
	return out, nil
}

func (r *ScheduleRepository) TenantTimezone(ctx context.Context, tenantID uuid.UUID) (string, error) {
	tz, err := r.queries(ctx).GetReportScheduleTenantTimezone(ctx, tenantID)
	if err != nil {
		return "", fmt.Errorf("get tenant timezone: %w", err)
	}
	return tz, nil
}

func marshalParams(p domain.Params) ([]byte, error) {
	b, err := json.Marshal(p)
	if err != nil {
		return nil, err
	}
	return b, nil
}

func unmarshalParams(raw []byte) domain.Params {
	var out domain.Params
	if len(raw) == 0 {
		return out
	}
	_ = json.Unmarshal(raw, &out)
	return out
}

func int2FromPtr(p *int) pgtype.Int2 {
	if p == nil {
		return pgtype.Int2{}
	}
	return pgtype.Int2{Int16: int16(*p), Valid: true} //nolint:gosec // validated 0-31 by domain.Schedule.Validate
}

func ptrFromInt2(v pgtype.Int2) *int {
	if !v.Valid {
		return nil
	}
	n := int(v.Int16)
	return &n
}

func toSchedule(row db.ReportSchedule) domain.Schedule {
	return domain.Schedule{
		ID: row.ID, TenantID: row.TenantID, ReportKind: row.ReportKind, Params: unmarshalParams(row.Params),
		Cadence: domain.Cadence(row.Cadence), Weekday: ptrFromInt2(row.Weekday), DayOfMonth: ptrFromInt2(row.DayOfMonth),
		Hour: int(row.Hour), Recipients: row.Recipients, Enabled: row.Enabled, CreatedBy: row.CreatedBy,
		CreatedAt: row.CreatedAt.Time, UpdatedAt: row.UpdatedAt.Time,
	}
}

func toRun(row db.ReportScheduleRun) domain.Run {
	return domain.Run{
		ID: row.ID, TenantID: row.TenantID, ScheduleID: row.ScheduleID, DueAt: row.DueAt.Time,
		Status: domain.RunStatus(row.Status), ErrorMessage: row.ErrorMessage, ObjectKey: row.ObjectKey,
		RanAt: pdatabase.TimePtr(row.RanAt), CreatedAt: row.CreatedAt.Time,
	}
}
