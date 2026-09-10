// Package repository is the sqlc-backed implementation of analytics'
// service.Repository.
package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics/service"
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

func (r *Repository) ListActiveTenants(ctx context.Context) ([]uuid.UUID, error) {
	ids, err := r.queries(ctx).AnalyticsListActiveTenants(ctx)
	if err != nil {
		return nil, fmt.Errorf("list active tenants: %w", err)
	}
	return ids, nil
}

func (r *Repository) ListActiveStudents(ctx context.Context, tenantID, academicYearID uuid.UUID) ([]service.StudentRef, error) {
	rows, err := r.queries(ctx).AnalyticsListActiveStudents(ctx, db.AnalyticsListActiveStudentsParams{
		TenantID: tenantID, AcademicYearID: academicYearID,
	})
	if err != nil {
		return nil, fmt.Errorf("list active students: %w", err)
	}
	out := make([]service.StudentRef, len(rows))
	for i, row := range rows {
		out[i] = service.StudentRef{StudentUserID: row.StudentUserID, ClassID: uuid.NullUUID{UUID: row.ClassID, Valid: true}}
	}
	return out, nil
}

func (r *Repository) GetHomeroomClassID(ctx context.Context, tenantID, academicYearID, teacherUserID uuid.UUID) (uuid.NullUUID, error) {
	classID, err := r.queries(ctx).AnalyticsGetHomeroomClassID(ctx, db.AnalyticsGetHomeroomClassIDParams{
		TenantID: tenantID, AcademicYearID: academicYearID, UserID: teacherUserID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.NullUUID{}, nil
	}
	if err != nil {
		return uuid.NullUUID{}, fmt.Errorf("get homeroom class: %w", err)
	}
	return pdatabase.UUIDOrNil(classID), nil
}

func (r *Repository) HasActiveDuty(ctx context.Context, tenantID, academicYearID, userID uuid.UUID, slug string) (bool, error) {
	has, err := r.queries(ctx).AnalyticsHasActiveDuty(ctx, db.AnalyticsHasActiveDutyParams{
		TenantID: tenantID, AcademicYearID: academicYearID, UserID: userID, Slug: slug,
	})
	if err != nil {
		return false, fmt.Errorf("check active duty: %w", err)
	}
	return has, nil
}

func (r *Repository) GetLatestPolicy(ctx context.Context, tenantID uuid.UUID) ([]byte, int, bool, error) {
	row, err := r.queries(ctx).AnalyticsGetLatestPolicy(ctx, tenantID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, false, nil
	}
	if err != nil {
		return nil, 0, false, fmt.Errorf("get policy: %w", err)
	}
	return row.Config, int(row.Version), true, nil
}

func (r *Repository) CreatePolicy(ctx context.Context, tenantID uuid.UUID, version int, config []byte, effectiveFrom time.Time, createdBy uuid.NullUUID) error {
	if err := r.queries(ctx).AnalyticsCreatePolicy(ctx, db.AnalyticsCreatePolicyParams{
		TenantID: tenantID, Version: int32(version), Config: config, //nolint:gosec // policy versions stay small
		EffectiveFrom: pdatabase.Date(effectiveFrom), CreatedBy: pdatabase.NullUUID(createdBy),
	}); err != nil {
		return fmt.Errorf("create policy: %w", err)
	}
	return nil
}

func (r *Repository) UpsertResult(ctx context.Context, tenantID uuid.UUID, res service.StoredResult) error {
	signals, err := json.Marshal(res.Signals)
	if err != nil {
		return fmt.Errorf("marshal signals: %w", err)
	}
	reasons, err := json.Marshal(res.Reasons)
	if err != nil {
		return fmt.Errorf("marshal reasons: %w", err)
	}
	if err := r.queries(ctx).AnalyticsUpsertStudentRisk(ctx, db.AnalyticsUpsertStudentRiskParams{
		TenantID: tenantID, AcademicYearID: res.AcademicYearID, StudentUserID: res.StudentUserID,
		ClassID: pdatabase.NullUUID(res.ClassID), Level: string(res.Level), Score: int32(res.Score), //nolint:gosec // bounded by policy weights
		Signals: signals, Reasons: reasons, PolicyVersion: int32(res.PolicyVersion), //nolint:gosec // policy versions stay small
		ComputedAt: pdatabase.Timestamptz(res.ComputedAt),
	}); err != nil {
		return fmt.Errorf("upsert student risk: %w", err)
	}
	return nil
}

func (r *Repository) ListResults(ctx context.Context, tenantID, academicYearID uuid.UUID, classID uuid.NullUUID) ([]service.StoredResult, error) {
	rows, err := r.queries(ctx).AnalyticsListStudentRisk(ctx, db.AnalyticsListStudentRiskParams{
		TenantID: tenantID, AcademicYearID: academicYearID, ClassID: pdatabase.NullUUID(classID),
	})
	if err != nil {
		return nil, fmt.Errorf("list student risk: %w", err)
	}
	out := make([]service.StoredResult, len(rows))
	for i, row := range rows {
		result, err := toResult(row)
		if err != nil {
			return nil, err
		}
		out[i] = result
	}
	return out, nil
}

func (r *Repository) GetResult(ctx context.Context, tenantID, academicYearID, studentID uuid.UUID) (service.StoredResult, bool, error) {
	row, err := r.queries(ctx).AnalyticsGetStudentRisk(ctx, db.AnalyticsGetStudentRiskParams{
		TenantID: tenantID, AcademicYearID: academicYearID, StudentUserID: studentID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return service.StoredResult{}, false, nil
	}
	if err != nil {
		return service.StoredResult{}, false, fmt.Errorf("get student risk: %w", err)
	}
	result, err := toResult(row)
	if err != nil {
		return service.StoredResult{}, false, err
	}
	return result, true, nil
}

func toResult(row db.AnalyticsStudentRisk) (service.StoredResult, error) {
	var signals domain.Signals
	if err := json.Unmarshal(row.Signals, &signals); err != nil {
		return service.StoredResult{}, fmt.Errorf("unmarshal signals: %w", err)
	}
	var reasons []domain.Reason
	if err := json.Unmarshal(row.Reasons, &reasons); err != nil {
		return service.StoredResult{}, fmt.Errorf("unmarshal reasons: %w", err)
	}
	return service.StoredResult{
		AcademicYearID: row.AcademicYearID,
		StudentUserID:  row.StudentUserID,
		ClassID:        pdatabase.UUIDOrNil(row.ClassID),
		Level:          domain.Level(row.Level),
		Score:          int(row.Score),
		Signals:        signals,
		Reasons:        reasons,
		PolicyVersion:  int(row.PolicyVersion),
		ComputedAt:     row.ComputedAt.Time,
	}, nil
}
