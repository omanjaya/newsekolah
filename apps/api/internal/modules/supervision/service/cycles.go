package service

import (
	"context"
	"strings"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/supervision/domain"
)

type CycleInput struct {
	Name       string
	Instrument domain.Instrument
}

func (s *Service) CreateCycle(ctx context.Context, tenantID uuid.UUID, in CycleInput) (domain.SupervisionCycle, error) {
	cycle := domain.SupervisionCycle{Name: strings.TrimSpace(in.Name), Instrument: in.Instrument}
	if err := cycle.Validate(); err != nil {
		return domain.SupervisionCycle{}, err
	}
	var out domain.SupervisionCycle
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.requireEnabled(ctx, tenantID); err != nil {
			return err
		}
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		cycle.TenantID, cycle.AcademicYearID = tenantID, yearID
		out, err = s.repo.CreateCycle(ctx, cycle)
		return err
	})
	return out, err
}

func (s *Service) UpdateCycle(ctx context.Context, tenantID, id uuid.UUID, in CycleInput) (domain.SupervisionCycle, error) {
	var out domain.SupervisionCycle
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.requireEnabled(ctx, tenantID); err != nil {
			return err
		}
		current, ok, err := s.repo.GetCycle(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrCycleNotFound
		}
		current.Name, current.Instrument = strings.TrimSpace(in.Name), in.Instrument
		if err := current.Validate(); err != nil {
			return err
		}
		out, err = s.repo.UpdateCycle(ctx, current)
		return err
	})
	return out, err
}

func (s *Service) GetCycle(ctx context.Context, tenantID, id uuid.UUID) (domain.SupervisionCycle, error) {
	var out domain.SupervisionCycle
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		cycle, ok, err := s.repo.GetCycle(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrCycleNotFound
		}
		out = cycle
		return nil
	})
	return out, err
}

func (s *Service) ListCyclesForYear(ctx context.Context, tenantID uuid.UUID) ([]domain.SupervisionCycle, error) {
	var out []domain.SupervisionCycle
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		out, err = s.repo.ListCyclesForYear(ctx, tenantID, yearID)
		return err
	})
	return out, err
}
