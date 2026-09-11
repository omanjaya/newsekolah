package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school/domain"
)

// CreateAcademicYear and ActivateAcademicYear used to be a second write
// path onto academic_years, parallel to modules/academic's HTTP-facing
// one. Neither had a caller outside this module (seed.go writes through
// s.repo directly, bypassing period/archive validation on purpose for a
// fresh tenant), so they were removed rather than kept as unused surface
// -- the single writer for the HTTP API is modules/academic/service.
// This module keeps only the read paths other modules' AcademicYearReader
// implementations need, plus the repository methods seed.go still calls
// directly.

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
