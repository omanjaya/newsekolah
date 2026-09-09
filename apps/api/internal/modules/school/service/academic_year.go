package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school/domain"
)

// CreateAcademicYear validates the period and delegates to the repository.
// It never activates the new year; call ActivateAcademicYear explicitly.
func (s *Service) CreateAcademicYear(ctx context.Context, tenantID uuid.UUID, label string, startsOn, endsOn time.Time) (domain.AcademicYear, error) {
	if err := domain.ValidatePeriod(startsOn, endsOn); err != nil {
		return domain.AcademicYear{}, err
	}
	var year domain.AcademicYear
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		year, err = s.repo.CreateAcademicYear(ctx, tenantID, label, startsOn, endsOn)
		return err
	})
	return year, err
}

// ActivateAcademicYear guarantees at most one active academic year per
// tenant: it deactivates every other year before activating the requested
// one, in the same transaction.
func (s *Service) ActivateAcademicYear(ctx context.Context, tenantID, id uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if _, err := s.repo.GetAcademicYearByID(ctx, tenantID, id); err != nil {
			return domain.ErrAcademicYearNotFound
		}
		if err := s.repo.DeactivateAllAcademicYears(ctx, tenantID); err != nil {
			return err
		}
		return s.repo.ActivateAcademicYear(ctx, tenantID, id)
	})
}

func (s *Service) GetActiveAcademicYear(ctx context.Context, tenantID uuid.UUID) (domain.AcademicYear, bool, error) {
	var (
		year domain.AcademicYear
		ok   bool
	)
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		year, ok, err = s.repo.GetActiveAcademicYear(ctx, tenantID)
		return err
	})
	return year, ok, err
}

func (s *Service) ListAcademicYears(ctx context.Context, tenantID uuid.UUID) ([]domain.AcademicYear, error) {
	var years []domain.AcademicYear
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		years, err = s.repo.ListAcademicYears(ctx, tenantID)
		return err
	})
	return years, err
}

// GetActiveAcademicYearID implements identity/service.AcademicYearReader.
// Called from inside identity's own transaction (loadPrincipal runs within
// Service.withTx already), so this reuses that transaction via
// database.TxFromContext instead of opening a nested one.
func (s *Service) GetActiveAcademicYearID(ctx context.Context, tenantID uuid.UUID) (uuid.UUID, bool, error) {
	year, ok, err := s.repo.GetActiveAcademicYear(ctx, tenantID)
	if err != nil || !ok {
		return uuid.UUID{}, false, err
	}
	return year.ID, true, nil
}

// ActiveAcademicYearLabel implements identity/service.AcademicYearReader.
func (s *Service) ActiveAcademicYearLabel(ctx context.Context, tenantID, academicYearID uuid.UUID) (string, error) {
	year, err := s.repo.GetAcademicYearByID(ctx, tenantID, academicYearID)
	if err != nil {
		return "", err
	}
	return year.Label, nil
}
