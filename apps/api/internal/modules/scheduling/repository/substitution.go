package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func (r *Repository) CreateSubstitution(ctx context.Context, s domain.Substitution) (domain.Substitution, error) {
	row, err := r.queries(ctx).CreateSubstitutionRequest(ctx, db.CreateSubstitutionRequestParams{
		TenantID: s.TenantID, AcademicYearID: s.AcademicYearID, ScheduleID: s.ScheduleID,
		Date: pdatabase.Date(s.Date), RequesterUserID: s.RequesterUserID, SubstituteUserID: s.SubstituteUserID,
		RequesterNote: pdatabase.Text(s.RequesterNote),
	})
	if err != nil {
		return domain.Substitution{}, err
	}
	return toSubstitution(row), nil
}

func (r *Repository) GetSubstitutionByID(ctx context.Context, tenantID, id uuid.UUID) (domain.Substitution, error) {
	row, err := r.queries(ctx).GetSubstitutionByID(ctx, db.GetSubstitutionByIDParams{TenantID: tenantID, ID: id})
	if err != nil {
		return domain.Substitution{}, err
	}
	return toSubstitution(row), nil
}

func (r *Repository) GetActiveSubstitutionForScheduleDate(ctx context.Context, tenantID, scheduleID uuid.UUID, date time.Time) (domain.Substitution, bool, error) {
	row, err := r.queries(ctx).GetActiveSubstitutionForScheduleDate(ctx, db.GetActiveSubstitutionForScheduleDateParams{
		TenantID: tenantID, ScheduleID: scheduleID, Date: pdatabase.Date(date),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Substitution{}, false, nil
	}
	if err != nil {
		return domain.Substitution{}, false, err
	}
	return toSubstitution(row), true, nil
}

func (r *Repository) GetAcceptedSubstitutionForScheduleDate(ctx context.Context, tenantID, scheduleID, substituteUserID uuid.UUID, date time.Time) (domain.Substitution, bool, error) {
	row, err := r.queries(ctx).GetAcceptedSubstitutionForScheduleDate(ctx, db.GetAcceptedSubstitutionForScheduleDateParams{
		TenantID: tenantID, ScheduleID: scheduleID, Date: pdatabase.Date(date), SubstituteUserID: substituteUserID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Substitution{}, false, nil
	}
	if err != nil {
		return domain.Substitution{}, false, err
	}
	return toSubstitution(row), true, nil
}

func (r *Repository) RespondSubstitution(ctx context.Context, tenantID, id uuid.UUID, status domain.SubstitutionStatus, note string) (domain.Substitution, error) {
	row, err := r.queries(ctx).RespondSubstitutionRequest(ctx, db.RespondSubstitutionRequestParams{
		TenantID: tenantID, ID: id, Status: string(status), ResponseNote: pdatabase.Text(note),
	})
	if err != nil {
		return domain.Substitution{}, err
	}
	return toSubstitution(row), nil
}

func (r *Repository) CancelSubstitution(ctx context.Context, tenantID, id uuid.UUID) (domain.Substitution, error) {
	row, err := r.queries(ctx).CancelSubstitutionRequest(ctx, db.CancelSubstitutionRequestParams{TenantID: tenantID, ID: id})
	if err != nil {
		return domain.Substitution{}, err
	}
	return toSubstitution(row), nil
}

func (r *Repository) ListSubstitutionsIncoming(ctx context.Context, tenantID, userID uuid.UUID) ([]domain.Substitution, error) {
	rows, err := r.queries(ctx).ListSubstitutionsIncoming(ctx, db.ListSubstitutionsIncomingParams{TenantID: tenantID, SubstituteUserID: userID})
	if err != nil {
		return nil, err
	}
	return toSubstitutions(rows), nil
}

func (r *Repository) ListSubstitutionsOutgoing(ctx context.Context, tenantID, userID uuid.UUID) ([]domain.Substitution, error) {
	rows, err := r.queries(ctx).ListSubstitutionsOutgoing(ctx, db.ListSubstitutionsOutgoingParams{TenantID: tenantID, RequesterUserID: userID})
	if err != nil {
		return nil, err
	}
	return toSubstitutions(rows), nil
}

func (r *Repository) ListAcceptedSubstitutionsForSubstituteDate(ctx context.Context, tenantID, substituteUserID uuid.UUID, date time.Time) ([]domain.Substitution, error) {
	rows, err := r.queries(ctx).ListAcceptedSubstitutionsForSubstituteDate(ctx, db.ListAcceptedSubstitutionsForSubstituteDateParams{
		TenantID: tenantID, SubstituteUserID: substituteUserID, Date: pdatabase.Date(date),
	})
	if err != nil {
		return nil, err
	}
	return toSubstitutions(rows), nil
}

func toSubstitutions(rows []db.SubstitutionRequest) []domain.Substitution {
	out := make([]domain.Substitution, len(rows))
	for i, row := range rows {
		out[i] = toSubstitution(row)
	}
	return out
}
