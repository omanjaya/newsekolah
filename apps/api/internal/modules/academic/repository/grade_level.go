package repository

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
)

func (r *Repository) CreateGradeLevel(ctx context.Context, tenantID uuid.UUID, code, name string, sequence int16) (domain.GradeLevel, error) {
	row, err := r.queries(ctx).AcademicCreateGradeLevel(ctx, db.AcademicCreateGradeLevelParams{
		TenantID: tenantID, Code: code, Name: name, Sequence: sequence,
	})
	if err != nil {
		return domain.GradeLevel{}, err
	}
	return toGradeLevel(row), nil
}

// ApplyGradeLevelTemplateRow inserts one template row unless the tenant
// already has a grade level with that code, in which case it returns
// (zero value, false, nil) so the caller (ApplyGradeLevelTemplate) can
// treat "already exists" as a normal skip, not an error.
func (r *Repository) ApplyGradeLevelTemplateRow(ctx context.Context, tenantID uuid.UUID, code, name string, sequence int16) (domain.GradeLevel, bool, error) {
	row, err := r.queries(ctx).AcademicApplyGradeLevelTemplateRow(ctx, db.AcademicApplyGradeLevelTemplateRowParams{
		TenantID: tenantID, Code: code, Name: name, Sequence: sequence,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.GradeLevel{}, false, nil
		}
		return domain.GradeLevel{}, false, err
	}
	return toGradeLevel(row), true, nil
}

func (r *Repository) UpdateGradeLevel(ctx context.Context, tenantID, id uuid.UUID, code, name string, sequence int16) (domain.GradeLevel, error) {
	row, err := r.queries(ctx).AcademicUpdateGradeLevel(ctx, db.AcademicUpdateGradeLevelParams{
		TenantID: tenantID, ID: id, Code: code, Name: name, Sequence: sequence,
	})
	if err != nil {
		return domain.GradeLevel{}, err
	}
	return toGradeLevel(row), nil
}

func (r *Repository) GetGradeLevelByID(ctx context.Context, tenantID, id uuid.UUID) (domain.GradeLevel, error) {
	row, err := r.queries(ctx).AcademicGetGradeLevelByID(ctx, db.AcademicGetGradeLevelByIDParams{TenantID: tenantID, ID: id})
	if err != nil {
		return domain.GradeLevel{}, err
	}
	return toGradeLevel(row), nil
}

func (r *Repository) ListGradeLevels(ctx context.Context, tenantID uuid.UUID) ([]domain.GradeLevel, error) {
	rows, err := r.queries(ctx).AcademicListGradeLevels(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	levels := make([]domain.GradeLevel, len(rows))
	for i, row := range rows {
		levels[i] = toGradeLevel(row)
	}
	return levels, nil
}

func (r *Repository) DeleteGradeLevel(ctx context.Context, tenantID, id uuid.UUID) error {
	return r.queries(ctx).AcademicDeleteGradeLevel(ctx, db.AcademicDeleteGradeLevelParams{TenantID: tenantID, ID: id})
}

func (r *Repository) CountClassesForGradeLevel(ctx context.Context, tenantID, id uuid.UUID) (int64, error) {
	return r.queries(ctx).AcademicCountClassesForGradeLevel(ctx, db.AcademicCountClassesForGradeLevelParams{TenantID: tenantID, GradeLevelID: id})
}

func (r *Repository) CreateTrack(ctx context.Context, tenantID uuid.UUID, code, name string) (domain.Track, error) {
	row, err := r.queries(ctx).AcademicCreateTrack(ctx, db.AcademicCreateTrackParams{TenantID: tenantID, Code: code, Name: name})
	if err != nil {
		return domain.Track{}, err
	}
	return toTrack(row), nil
}

func (r *Repository) UpdateTrack(ctx context.Context, tenantID, id uuid.UUID, code, name string) (domain.Track, error) {
	row, err := r.queries(ctx).AcademicUpdateTrack(ctx, db.AcademicUpdateTrackParams{TenantID: tenantID, ID: id, Code: code, Name: name})
	if err != nil {
		return domain.Track{}, err
	}
	return toTrack(row), nil
}

func (r *Repository) GetTrackByID(ctx context.Context, tenantID, id uuid.UUID) (domain.Track, error) {
	row, err := r.queries(ctx).AcademicGetTrackByID(ctx, db.AcademicGetTrackByIDParams{TenantID: tenantID, ID: id})
	if err != nil {
		return domain.Track{}, err
	}
	return toTrack(row), nil
}

func (r *Repository) ListTracks(ctx context.Context, tenantID uuid.UUID) ([]domain.Track, error) {
	rows, err := r.queries(ctx).AcademicListTracks(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	tracks := make([]domain.Track, len(rows))
	for i, row := range rows {
		tracks[i] = toTrack(row)
	}
	return tracks, nil
}

func (r *Repository) DeleteTrack(ctx context.Context, tenantID, id uuid.UUID) error {
	return r.queries(ctx).AcademicDeleteTrack(ctx, db.AcademicDeleteTrackParams{TenantID: tenantID, ID: id})
}

func (r *Repository) CountClassesForTrack(ctx context.Context, tenantID, id uuid.UUID) (int64, error) {
	return r.queries(ctx).AcademicCountClassesForTrack(ctx, db.AcademicCountClassesForTrackParams{TenantID: tenantID, TrackID: pgtype.UUID{Bytes: id, Valid: true}})
}

func toGradeLevel(row db.GradeLevel) domain.GradeLevel {
	return domain.GradeLevel{ID: row.ID, TenantID: row.TenantID, Code: row.Code, Name: row.Name, Sequence: row.Sequence}
}

func toTrack(row db.Track) domain.Track {
	return domain.Track{ID: row.ID, TenantID: row.TenantID, Code: row.Code, Name: row.Name}
}
