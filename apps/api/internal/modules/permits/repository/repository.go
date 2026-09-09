// Package repository implements permits/service.Repository with sqlc.
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
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

type Repository struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

var _ service.Repository = (*Repository)(nil)

func (r *Repository) queries(ctx context.Context) *db.Queries {
	if tx, ok := pdatabase.TxFromContext(ctx); ok {
		return db.New(tx)
	}
	return db.New(r.pool)
}

func notFound(err error) bool { return errors.Is(err, pgx.ErrNoRows) }

func mustJSON(v any) []byte {
	if v == nil {
		return []byte("{}")
	}
	b, err := json.Marshal(v)
	if err != nil {
		return []byte("{}")
	}
	return b
}

func jsonUnmarshal(raw []byte, v any) error { return json.Unmarshal(raw, v) }

func jsonMap(raw []byte) map[string]any {
	out := map[string]any{}
	if len(raw) == 0 {
		return out
	}
	_ = json.Unmarshal(raw, &out)
	return out
}

func timestamptzPtr(t *time.Time) pgtype.Timestamptz {
	if t == nil {
		return pgtype.Timestamptz{}
	}
	return pdatabase.Timestamptz(*t)
}

func uuidNullable(id uuid.UUID) pgtype.UUID {
	if id == uuid.Nil {
		return pgtype.UUID{}
	}
	return pgtype.UUID{Bytes: id, Valid: true}
}

// Workflow definitions.

func toDefinition(row db.WorkflowDefinition) domain.Definition {
	var stages []domain.Stage
	_ = json.Unmarshal(row.Stages, &stages)
	return domain.Definition{
		ID: row.ID, TenantID: row.TenantID, Kind: domain.Kind(row.Kind), Version: int(row.Version), IsActive: row.IsActive,
		Stages: stages, Config: jsonMap(row.Config), CreatedBy: pdatabase.UUIDOrNil(row.CreatedBy),
		CreatedAt: pdatabase.TimeOrZero(row.CreatedAt),
	}
}

func (r *Repository) GetActiveDefinition(ctx context.Context, tenantID uuid.UUID, kind domain.Kind) (domain.Definition, bool, error) {
	row, err := r.queries(ctx).GetActiveWorkflowDefinition(ctx, db.GetActiveWorkflowDefinitionParams{TenantID: tenantID, Kind: string(kind)})
	if notFound(err) {
		return domain.Definition{}, false, nil
	}
	if err != nil {
		return domain.Definition{}, false, fmt.Errorf("get active definition: %w", err)
	}
	return toDefinition(row), true, nil
}

func (r *Repository) GetDefinitionByID(ctx context.Context, tenantID, id uuid.UUID) (domain.Definition, bool, error) {
	row, err := r.queries(ctx).GetWorkflowDefinitionByID(ctx, db.GetWorkflowDefinitionByIDParams{TenantID: tenantID, ID: id})
	if notFound(err) {
		return domain.Definition{}, false, nil
	}
	if err != nil {
		return domain.Definition{}, false, fmt.Errorf("get definition: %w", err)
	}
	return toDefinition(row), true, nil
}

func (r *Repository) ListDefinitions(ctx context.Context, tenantID uuid.UUID) ([]domain.Definition, error) {
	rows, err := r.queries(ctx).ListWorkflowDefinitions(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list definitions: %w", err)
	}
	out := make([]domain.Definition, len(rows))
	for i, row := range rows {
		out[i] = toDefinition(row)
	}
	return out, nil
}

func (r *Repository) LatestDefinitionVersion(ctx context.Context, tenantID uuid.UUID, kind domain.Kind) (int, error) {
	v, err := r.queries(ctx).GetLatestWorkflowDefinitionVersion(ctx, db.GetLatestWorkflowDefinitionVersionParams{TenantID: tenantID, Kind: string(kind)})
	if notFound(err) {
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("latest definition version: %w", err)
	}
	return int(v), nil
}

func (r *Repository) DeactivateActiveDefinitions(ctx context.Context, tenantID uuid.UUID, kind domain.Kind) error {
	return r.queries(ctx).DeactivateActiveWorkflowDefinitions(ctx, db.DeactivateActiveWorkflowDefinitionsParams{TenantID: tenantID, Kind: string(kind)})
}

func (r *Repository) CreateDefinition(ctx context.Context, def domain.Definition) (domain.Definition, error) {
	row, err := r.queries(ctx).CreateWorkflowDefinition(ctx, db.CreateWorkflowDefinitionParams{
		TenantID: def.TenantID, Kind: string(def.Kind), Version: int32(def.Version), IsActive: def.IsActive, //nolint:gosec // small version numbers
		Stages: mustJSON(def.Stages), Config: mustJSON(def.Config), CreatedBy: pdatabase.NullUUID(def.CreatedBy),
	})
	if err != nil {
		return domain.Definition{}, fmt.Errorf("create definition: %w", err)
	}
	return toDefinition(row), nil
}

// Workflow instances.

func toInstance(row db.WorkflowInstance) domain.Instance {
	return domain.Instance{
		ID: row.ID, TenantID: row.TenantID, AcademicYearID: row.AcademicYearID, DefinitionID: row.DefinitionID,
		Kind: domain.Kind(row.Kind), SubjectUserID: row.SubjectUserID, ClassID: pdatabase.UUIDOrNil(row.ClassID),
		CurrentStageIndex: int(row.CurrentStageIndex), Status: domain.Status(row.Status), Payload: jsonMap(row.Payload),
		OpenedAt: pdatabase.TimeOrZero(row.OpenedAt), ClosedAt: pdatabase.TimePtr(row.ClosedAt),
		CreatedBy: pdatabase.UUIDOrNil(row.CreatedBy), CreatedAt: pdatabase.TimeOrZero(row.CreatedAt), UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt),
	}
}

func (r *Repository) CreateInstance(ctx context.Context, inst domain.Instance) (domain.Instance, error) {
	row, err := r.queries(ctx).CreateWorkflowInstance(ctx, db.CreateWorkflowInstanceParams{
		TenantID: inst.TenantID, AcademicYearID: inst.AcademicYearID, DefinitionID: inst.DefinitionID, Kind: string(inst.Kind),
		SubjectUserID: inst.SubjectUserID, ClassID: pdatabase.NullUUID(inst.ClassID), Payload: mustJSON(inst.Payload),
		OpenedAt: pdatabase.Timestamptz(inst.OpenedAt), CreatedBy: pdatabase.NullUUID(inst.CreatedBy),
	})
	if err != nil {
		return domain.Instance{}, fmt.Errorf("create instance: %w", err)
	}
	return toInstance(row), nil
}

func (r *Repository) GetInstance(ctx context.Context, tenantID, id uuid.UUID) (domain.Instance, bool, error) {
	row, err := r.queries(ctx).GetWorkflowInstanceByID(ctx, db.GetWorkflowInstanceByIDParams{TenantID: tenantID, ID: id})
	if notFound(err) {
		return domain.Instance{}, false, nil
	}
	if err != nil {
		return domain.Instance{}, false, fmt.Errorf("get instance: %w", err)
	}
	return toInstance(row), true, nil
}

func (r *Repository) GetInstanceForUpdate(ctx context.Context, tenantID, id uuid.UUID) (domain.Instance, bool, error) {
	row, err := r.queries(ctx).GetWorkflowInstanceForUpdate(ctx, db.GetWorkflowInstanceForUpdateParams{TenantID: tenantID, ID: id})
	if notFound(err) {
		return domain.Instance{}, false, nil
	}
	if err != nil {
		return domain.Instance{}, false, fmt.Errorf("lock instance: %w", err)
	}
	return toInstance(row), true, nil
}

func (r *Repository) AdvanceInstance(ctx context.Context, tenantID, id uuid.UUID, stageIndex int, status domain.Status, closedAt *time.Time) (domain.Instance, error) {
	row, err := r.queries(ctx).AdvanceWorkflowInstanceStage(ctx, db.AdvanceWorkflowInstanceStageParams{
		TenantID: tenantID, ID: id, CurrentStageIndex: int32(stageIndex), Status: string(status), ClosedAt: timestamptzPtr(closedAt), //nolint:gosec // stage counts are tiny
	})
	if err != nil {
		return domain.Instance{}, fmt.Errorf("advance instance: %w", err)
	}
	return toInstance(row), nil
}

func (r *Repository) GetInProgressInstance(ctx context.Context, tenantID uuid.UUID, kind domain.Kind, subjectUserID uuid.UUID) (domain.Instance, bool, error) {
	row, err := r.queries(ctx).GetInProgressWorkflowInstance(ctx, db.GetInProgressWorkflowInstanceParams{TenantID: tenantID, Kind: string(kind), SubjectUserID: subjectUserID})
	if notFound(err) {
		return domain.Instance{}, false, nil
	}
	if err != nil {
		return domain.Instance{}, false, fmt.Errorf("get in-progress instance: %w", err)
	}
	return toInstance(row), true, nil
}

func (r *Repository) LockSubjectForInstanceCounting(ctx context.Context, tenantID, subjectUserID uuid.UUID) error {
	return r.queries(ctx).LockSubjectForInstanceCounting(ctx, db.LockSubjectForInstanceCountingParams{Column1: tenantID.String(), Column2: subjectUserID.String()})
}

func (r *Repository) CountInstancesForSubjectYear(ctx context.Context, tenantID uuid.UUID, kind domain.Kind, subjectUserID, academicYearID uuid.UUID) (int64, error) {
	return r.queries(ctx).CountWorkflowInstancesForSubjectYear(ctx, db.CountWorkflowInstancesForSubjectYearParams{
		TenantID: tenantID, Kind: string(kind), SubjectUserID: subjectUserID, AcademicYearID: academicYearID,
	})
}

func (r *Repository) ListInstancesBySubject(ctx context.Context, tenantID uuid.UUID, kind domain.Kind, subjectUserID uuid.UUID, limit, offset int) ([]domain.Instance, error) {
	rows, err := r.queries(ctx).ListWorkflowInstancesBySubject(ctx, db.ListWorkflowInstancesBySubjectParams{
		TenantID: tenantID, Kind: string(kind), SubjectUserID: subjectUserID, Limit: int32(limit), Offset: int32(offset), //nolint:gosec // paging values are clamped
	})
	if err != nil {
		return nil, fmt.Errorf("list instances: %w", err)
	}
	out := make([]domain.Instance, len(rows))
	for i, row := range rows {
		out[i] = toInstance(row)
	}
	return out, nil
}

func (r *Repository) ExpireHangingInstances(ctx context.Context, tenantID uuid.UUID, openedBefore time.Time) ([]domain.Instance, error) {
	rows, err := r.queries(ctx).ExpireHangingWorkflowInstances(ctx, db.ExpireHangingWorkflowInstancesParams{TenantID: tenantID, OpenedAt: pdatabase.Timestamptz(openedBefore)})
	if err != nil {
		return nil, fmt.Errorf("expire instances: %w", err)
	}
	out := make([]domain.Instance, len(rows))
	for i, row := range rows {
		out[i] = toInstance(row)
	}
	return out, nil
}

func (r *Repository) HasInProgressLateArrivalOn(ctx context.Context, tenantID, subjectUserID uuid.UUID, date time.Time) (bool, error) {
	_, err := r.queries(ctx).GetInProgressLateArrivalToday(ctx, db.GetInProgressLateArrivalTodayParams{
		TenantID: tenantID, SubjectUserID: subjectUserID, OpenedDate: pdatabase.Date(date),
	})
	if notFound(err) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("check late arrival: %w", err)
	}
	return true, nil
}

func (r *Repository) MergeInstancePayload(ctx context.Context, tenantID, instanceID uuid.UUID, extra map[string]any) (domain.Instance, error) {
	row, err := r.queries(ctx).MergeWorkflowInstancePayload(ctx, db.MergeWorkflowInstancePayloadParams{TenantID: tenantID, ID: instanceID, Payload: mustJSON(extra)})
	if err != nil {
		return domain.Instance{}, fmt.Errorf("merge payload: %w", err)
	}
	return toInstance(row), nil
}

// Workflow events.

func toEvent(row db.WorkflowEvent) domain.Event {
	return domain.Event{
		ID: row.ID, TenantID: row.TenantID, InstanceID: row.InstanceID, StageKey: pdatabase.TextOrEmpty(row.StageKey),
		FromStatus: domain.Status(row.FromStatus), ToStatus: domain.Status(row.ToStatus), ActorUserID: pdatabase.UUIDOrNil(row.ActorUserID),
		Verification: domain.Verification(row.Verification), ScanTokenID: pdatabase.UUIDOrNil(row.ScanTokenID),
		Note: pdatabase.TextOrEmpty(row.Note), OccurredAt: pdatabase.TimeOrZero(row.OccurredAt),
	}
}

func (r *Repository) CreateEvent(ctx context.Context, evt domain.Event) (domain.Event, error) {
	row, err := r.queries(ctx).CreateWorkflowEvent(ctx, db.CreateWorkflowEventParams{
		TenantID: evt.TenantID, InstanceID: evt.InstanceID, StageKey: pdatabase.Text(evt.StageKey),
		FromStatus: string(evt.FromStatus), ToStatus: string(evt.ToStatus), ActorUserID: pdatabase.NullUUID(evt.ActorUserID),
		Verification: string(evt.Verification), ScanTokenID: pdatabase.NullUUID(evt.ScanTokenID), Note: pdatabase.Text(evt.Note),
	})
	if err != nil {
		return domain.Event{}, fmt.Errorf("create event: %w", err)
	}
	return toEvent(row), nil
}

func (r *Repository) ListEvents(ctx context.Context, tenantID, instanceID uuid.UUID) ([]domain.Event, error) {
	rows, err := r.queries(ctx).ListWorkflowEventsByInstance(ctx, db.ListWorkflowEventsByInstanceParams{TenantID: tenantID, InstanceID: instanceID})
	if err != nil {
		return nil, fmt.Errorf("list events: %w", err)
	}
	out := make([]domain.Event, len(rows))
	for i, row := range rows {
		out[i] = toEvent(row)
	}
	return out, nil
}

func (r *Repository) GetEventByStage(ctx context.Context, tenantID, instanceID uuid.UUID, stageKey string) (domain.Event, bool, error) {
	row, err := r.queries(ctx).GetWorkflowEventByStage(ctx, db.GetWorkflowEventByStageParams{TenantID: tenantID, InstanceID: instanceID, StageKey: pdatabase.Text(stageKey)})
	if notFound(err) {
		return domain.Event{}, false, nil
	}
	if err != nil {
		return domain.Event{}, false, fmt.Errorf("get event by stage: %w", err)
	}
	return toEvent(row), true, nil
}
