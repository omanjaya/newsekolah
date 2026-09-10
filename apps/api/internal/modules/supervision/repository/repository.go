// Package repository is the sqlc-backed implementation of the supervision
// service's data boundary.
package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/supervision/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/supervision/service"
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

func (r *Repository) CreateCycle(ctx context.Context, c domain.SupervisionCycle) (domain.SupervisionCycle, error) {
	instrument, err := json.Marshal(c.Instrument)
	if err != nil {
		return domain.SupervisionCycle{}, fmt.Errorf("marshal instrument: %w", err)
	}
	row, err := r.queries(ctx).SupervisionCreateCycle(ctx, db.SupervisionCreateCycleParams{
		TenantID: c.TenantID, AcademicYearID: c.AcademicYearID, Name: c.Name, Instrument: instrument,
	})
	if err != nil {
		return domain.SupervisionCycle{}, fmt.Errorf("create cycle: %w", err)
	}
	return toCycle(row)
}

func (r *Repository) UpdateCycle(ctx context.Context, c domain.SupervisionCycle) (domain.SupervisionCycle, error) {
	instrument, err := json.Marshal(c.Instrument)
	if err != nil {
		return domain.SupervisionCycle{}, fmt.Errorf("marshal instrument: %w", err)
	}
	row, err := r.queries(ctx).SupervisionUpdateCycle(ctx, db.SupervisionUpdateCycleParams{
		TenantID: c.TenantID, ID: c.ID, Name: c.Name, Instrument: instrument,
	})
	if err != nil {
		return domain.SupervisionCycle{}, fmt.Errorf("update cycle: %w", err)
	}
	return toCycle(row)
}

func (r *Repository) GetCycle(ctx context.Context, tenantID, id uuid.UUID) (domain.SupervisionCycle, bool, error) {
	row, err := r.queries(ctx).SupervisionGetCycle(ctx, db.SupervisionGetCycleParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.SupervisionCycle{}, false, nil
	}
	if err != nil {
		return domain.SupervisionCycle{}, false, fmt.Errorf("get cycle: %w", err)
	}
	cycle, err := toCycle(row)
	return cycle, err == nil, err
}

func (r *Repository) ListCyclesForYear(ctx context.Context, tenantID, yearID uuid.UUID) ([]domain.SupervisionCycle, error) {
	rows, err := r.queries(ctx).SupervisionListCyclesForYear(ctx, db.SupervisionListCyclesForYearParams{TenantID: tenantID, AcademicYearID: yearID})
	if err != nil {
		return nil, fmt.Errorf("list cycles: %w", err)
	}
	out := make([]domain.SupervisionCycle, 0, len(rows))
	for _, row := range rows {
		cycle, err := toCycle(row)
		if err != nil {
			return nil, err
		}
		out = append(out, cycle)
	}
	return out, nil
}

func (r *Repository) CreateScheduledObservation(ctx context.Context, o domain.ScheduledObservation) (domain.ScheduledObservation, error) {
	row, err := r.queries(ctx).SupervisionCreateScheduledObservation(ctx, db.SupervisionCreateScheduledObservationParams{
		TenantID: o.TenantID, CycleID: o.CycleID, ScheduleID: o.ScheduleID, LessonDate: pdatabase.Date(o.LessonDate),
		TeacherUserID: o.TeacherUserID, ObserverUserID: o.ObserverUserID,
	})
	if err != nil {
		return domain.ScheduledObservation{}, fmt.Errorf("create scheduled observation: %w", err)
	}
	return toScheduled(row), nil
}

func (r *Repository) GetScheduledObservation(ctx context.Context, tenantID, id uuid.UUID) (domain.ScheduledObservation, bool, error) {
	row, err := r.queries(ctx).SupervisionGetScheduledObservation(ctx, db.SupervisionGetScheduledObservationParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ScheduledObservation{}, false, nil
	}
	if err != nil {
		return domain.ScheduledObservation{}, false, fmt.Errorf("get scheduled observation: %w", err)
	}
	return toScheduled(row), true, nil
}

func (r *Repository) ListScheduledForCycle(ctx context.Context, tenantID, cycleID uuid.UUID) ([]domain.ScheduledObservation, error) {
	rows, err := r.queries(ctx).SupervisionListScheduledForCycle(ctx, db.SupervisionListScheduledForCycleParams{TenantID: tenantID, CycleID: cycleID})
	if err != nil {
		return nil, fmt.Errorf("list scheduled for cycle: %w", err)
	}
	return toScheduledList(rows), nil
}

func (r *Repository) ListScheduledForTeacher(ctx context.Context, tenantID, cycleID, teacherUserID uuid.UUID) ([]domain.ScheduledObservation, error) {
	rows, err := r.queries(ctx).SupervisionListScheduledForTeacher(ctx, db.SupervisionListScheduledForTeacherParams{
		TenantID: tenantID, CycleID: cycleID, TeacherUserID: teacherUserID,
	})
	if err != nil {
		return nil, fmt.Errorf("list scheduled for teacher: %w", err)
	}
	return toScheduledList(rows), nil
}

func (r *Repository) CreateObservation(ctx context.Context, o domain.Observation) (domain.Observation, error) {
	scores, err := json.Marshal(o.Scores)
	if err != nil {
		return domain.Observation{}, fmt.Errorf("marshal scores: %w", err)
	}
	row, err := r.queries(ctx).SupervisionCreateObservation(ctx, db.SupervisionCreateObservationParams{
		TenantID: o.TenantID, ScheduledID: o.ScheduledID, CycleID: o.CycleID, TeacherUserID: o.TeacherUserID, ObserverUserID: o.ObserverUserID,
		Scores: scores, ObserverNotes: o.ObserverNotes, TeacherResponse: o.TeacherResponse, AgreedFollowUp: o.AgreedFollowUp,
		ObservedAt: pdatabase.Timestamptz(o.ObservedAt),
	})
	if err != nil {
		return domain.Observation{}, fmt.Errorf("create observation: %w", err)
	}
	return toObservation(row)
}

func (r *Repository) UpdateObservation(ctx context.Context, o domain.Observation) (domain.Observation, error) {
	scores, err := json.Marshal(o.Scores)
	if err != nil {
		return domain.Observation{}, fmt.Errorf("marshal scores: %w", err)
	}
	row, err := r.queries(ctx).SupervisionUpdateObservation(ctx, db.SupervisionUpdateObservationParams{
		TenantID: o.TenantID, ID: o.ID, Scores: scores, ObserverNotes: o.ObserverNotes,
		TeacherResponse: o.TeacherResponse, AgreedFollowUp: o.AgreedFollowUp,
	})
	if err != nil {
		return domain.Observation{}, fmt.Errorf("update observation: %w", err)
	}
	return toObservation(row)
}

func (r *Repository) GetObservation(ctx context.Context, tenantID, id uuid.UUID) (domain.Observation, bool, error) {
	row, err := r.queries(ctx).SupervisionGetObservation(ctx, db.SupervisionGetObservationParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Observation{}, false, nil
	}
	if err != nil {
		return domain.Observation{}, false, fmt.Errorf("get observation: %w", err)
	}
	obs, err := toObservation(row)
	return obs, err == nil, err
}

func (r *Repository) GetObservationByScheduled(ctx context.Context, tenantID, scheduledID uuid.UUID) (domain.Observation, bool, error) {
	row, err := r.queries(ctx).SupervisionGetObservationByScheduled(ctx, db.SupervisionGetObservationByScheduledParams{TenantID: tenantID, ScheduledID: scheduledID})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Observation{}, false, nil
	}
	if err != nil {
		return domain.Observation{}, false, fmt.Errorf("get observation by scheduled: %w", err)
	}
	obs, err := toObservation(row)
	return obs, err == nil, err
}

func (r *Repository) ListObservationsForTeacherCycle(ctx context.Context, tenantID, cycleID, teacherUserID uuid.UUID) ([]domain.Observation, error) {
	rows, err := r.queries(ctx).SupervisionListObservationsForTeacherCycle(ctx, db.SupervisionListObservationsForTeacherCycleParams{
		TenantID: tenantID, CycleID: cycleID, TeacherUserID: teacherUserID,
	})
	if err != nil {
		return nil, fmt.Errorf("list observations for teacher cycle: %w", err)
	}
	return toObservationList(rows)
}

func (r *Repository) ListObservationsForCycle(ctx context.Context, tenantID, cycleID uuid.UUID) ([]domain.Observation, error) {
	rows, err := r.queries(ctx).SupervisionListObservationsForCycle(ctx, db.SupervisionListObservationsForCycleParams{TenantID: tenantID, CycleID: cycleID})
	if err != nil {
		return nil, fmt.Errorf("list observations for cycle: %w", err)
	}
	return toObservationList(rows)
}

func (r *Repository) HasActiveDuty(ctx context.Context, tenantID, yearID, userID uuid.UUID, slug string) (bool, error) {
	has, err := r.queries(ctx).SupervisionHasActiveDuty(ctx, db.SupervisionHasActiveDutyParams{
		TenantID: tenantID, AcademicYearID: yearID, UserID: userID, Slug: slug,
	})
	if err != nil {
		return false, fmt.Errorf("has active duty: %w", err)
	}
	return has, nil
}

func (r *Repository) TeacherName(ctx context.Context, tenantID, teacherUserID uuid.UUID) (string, error) {
	name, err := r.queries(ctx).SupervisionTeacherName(ctx, db.SupervisionTeacherNameParams{TenantID: tenantID, ID: teacherUserID})
	if err != nil {
		return "", fmt.Errorf("teacher name: %w", err)
	}
	return name, nil
}

// Mapping.

func toCycle(row db.SupervisionCycle) (domain.SupervisionCycle, error) {
	var instrument domain.Instrument
	if err := json.Unmarshal(row.Instrument, &instrument); err != nil {
		return domain.SupervisionCycle{}, fmt.Errorf("unmarshal instrument: %w", err)
	}
	return domain.SupervisionCycle{
		ID: row.ID, TenantID: row.TenantID, AcademicYearID: row.AcademicYearID, Name: row.Name, Instrument: instrument,
		CreatedAt: pdatabase.TimeOrZero(row.CreatedAt), UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt),
	}, nil
}

func toScheduled(row db.SupervisionScheduledObservation) domain.ScheduledObservation {
	return domain.ScheduledObservation{
		ID: row.ID, TenantID: row.TenantID, CycleID: row.CycleID, ScheduleID: row.ScheduleID,
		LessonDate: pdatabase.DateOrZero(row.LessonDate), TeacherUserID: row.TeacherUserID, ObserverUserID: row.ObserverUserID,
		CreatedAt: pdatabase.TimeOrZero(row.CreatedAt),
	}
}

func toScheduledList(rows []db.SupervisionScheduledObservation) []domain.ScheduledObservation {
	out := make([]domain.ScheduledObservation, len(rows))
	for i, row := range rows {
		out[i] = toScheduled(row)
	}
	return out
}

func toObservation(row db.SupervisionObservation) (domain.Observation, error) {
	var scores []domain.CriterionScore
	if err := json.Unmarshal(row.Scores, &scores); err != nil {
		return domain.Observation{}, fmt.Errorf("unmarshal scores: %w", err)
	}
	return domain.Observation{
		ID: row.ID, TenantID: row.TenantID, ScheduledID: row.ScheduledID, CycleID: row.CycleID, TeacherUserID: row.TeacherUserID,
		ObserverUserID: row.ObserverUserID, Scores: scores, ObserverNotes: row.ObserverNotes, TeacherResponse: row.TeacherResponse,
		AgreedFollowUp: row.AgreedFollowUp, ObservedAt: pdatabase.TimeOrZero(row.ObservedAt),
		CreatedAt: pdatabase.TimeOrZero(row.CreatedAt), UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt),
	}, nil
}

func toObservationList(rows []db.SupervisionObservation) ([]domain.Observation, error) {
	out := make([]domain.Observation, 0, len(rows))
	for _, row := range rows {
		obs, err := toObservation(row)
		if err != nil {
			return nil, err
		}
		out = append(out, obs)
	}
	return out, nil
}
