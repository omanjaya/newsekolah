package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
)

type gradeRepository interface {
	CreateGradeLevel(ctx context.Context, tenantID uuid.UUID, code, name string, sequence int16) (domain.GradeLevel, error)
	ApplyGradeLevelTemplateRow(ctx context.Context, tenantID uuid.UUID, code, name string, sequence int16) (domain.GradeLevel, bool, error)
	UpdateGradeLevel(ctx context.Context, tenantID, id uuid.UUID, code, name string, sequence int16) (domain.GradeLevel, error)
	GetGradeLevelByID(ctx context.Context, tenantID, id uuid.UUID) (domain.GradeLevel, error)
	ListGradeLevels(ctx context.Context, tenantID uuid.UUID) ([]domain.GradeLevel, error)
	DeleteGradeLevel(ctx context.Context, tenantID, id uuid.UUID) error
	CountClassesForGradeLevel(ctx context.Context, tenantID, id uuid.UUID) (int64, error)

	CreateTrack(ctx context.Context, tenantID uuid.UUID, code, name string) (domain.Track, error)
	UpdateTrack(ctx context.Context, tenantID, id uuid.UUID, code, name string) (domain.Track, error)
	GetTrackByID(ctx context.Context, tenantID, id uuid.UUID) (domain.Track, error)
	ListTracks(ctx context.Context, tenantID uuid.UUID) ([]domain.Track, error)
	DeleteTrack(ctx context.Context, tenantID, id uuid.UUID) error
	CountClassesForTrack(ctx context.Context, tenantID, id uuid.UUID) (int64, error)
}

func (s *Service) ListGradeLevels(ctx context.Context, tenantID uuid.UUID) ([]domain.GradeLevel, error) {
	var levels []domain.GradeLevel
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		levels, err = s.repo.ListGradeLevels(ctx, tenantID)
		return err
	})
	return levels, err
}

func (s *Service) CreateGradeLevel(ctx context.Context, tenantID uuid.UUID, code, name string, sequence int16) (domain.GradeLevel, error) {
	var level domain.GradeLevel
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		level, err = s.repo.CreateGradeLevel(ctx, tenantID, code, name, sequence)
		return mapUniqueViolation(err, domain.ErrGradeLevelCodeExists)
	})
	return level, err
}

func (s *Service) UpdateGradeLevel(ctx context.Context, tenantID, id uuid.UUID, code, name string, sequence int16) (domain.GradeLevel, error) {
	var level domain.GradeLevel
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		level, err = s.repo.UpdateGradeLevel(ctx, tenantID, id, code, name, sequence)
		return mapNotFound(mapUniqueViolation(err, domain.ErrGradeLevelCodeExists), domain.ErrGradeLevelNotFound)
	})
	return level, err
}

// DeleteGradeLevel refuses to remove a grade level that any class still
// references (409 ACADEMIC_HAS_DEPENDENTS), per the module's dependent-data
// rule.
func (s *Service) DeleteGradeLevel(ctx context.Context, tenantID, id uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		count, err := s.repo.CountClassesForGradeLevel(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if count > 0 {
			return domain.ErrHasDependents
		}
		return s.repo.DeleteGradeLevel(ctx, tenantID, id)
	})
}

// ApplyGradeLevelTemplate creates every grade level in a known template
// (SD 1-6, SMP 7-9, SMA/SMK X-XII) that the tenant does not already have,
// identified by code, and returns the ones actually created (already
// existing codes are skipped, not overwritten, so this is safe to call
// more than once).
func (s *Service) ApplyGradeLevelTemplate(ctx context.Context, tenantID uuid.UUID, template string) ([]domain.GradeLevel, error) {
	rows, err := domain.GradeLevelTemplateRows(template)
	if err != nil {
		return nil, err
	}

	created := make([]domain.GradeLevel, 0, len(rows))
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		for _, row := range rows {
			level, ok, err := s.repo.ApplyGradeLevelTemplateRow(ctx, tenantID, row.Code, row.Name, row.Sequence)
			if err != nil {
				return err
			}
			if ok {
				created = append(created, level)
			}
		}
		return nil
	})
	return created, err
}

func (s *Service) ListTracks(ctx context.Context, tenantID uuid.UUID) ([]domain.Track, error) {
	var tracks []domain.Track
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		tracks, err = s.repo.ListTracks(ctx, tenantID)
		return err
	})
	return tracks, err
}

func (s *Service) CreateTrack(ctx context.Context, tenantID uuid.UUID, code, name string) (domain.Track, error) {
	var track domain.Track
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		track, err = s.repo.CreateTrack(ctx, tenantID, code, name)
		return mapUniqueViolation(err, domain.ErrTrackCodeExists)
	})
	return track, err
}

func (s *Service) UpdateTrack(ctx context.Context, tenantID, id uuid.UUID, code, name string) (domain.Track, error) {
	var track domain.Track
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		track, err = s.repo.UpdateTrack(ctx, tenantID, id, code, name)
		return mapNotFound(mapUniqueViolation(err, domain.ErrTrackCodeExists), domain.ErrTrackNotFound)
	})
	return track, err
}

func (s *Service) DeleteTrack(ctx context.Context, tenantID, id uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		count, err := s.repo.CountClassesForTrack(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if count > 0 {
			return domain.ErrHasDependents
		}
		return s.repo.DeleteTrack(ctx, tenantID, id)
	})
}
