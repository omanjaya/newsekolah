package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
)

// TitleWithAvailability is a title plus its live copy counts, for the
// catalogue list and the public OPAC.
type TitleWithAvailability struct {
	domain.Title
	TotalCopies     int
	AvailableCopies int
}

func (s *Service) CreateTitle(ctx context.Context, t domain.Title) (domain.Title, error) {
	if t.Title == "" {
		return domain.Title{}, domain.ErrInvalidInput
	}
	if t.Language == "" {
		t.Language = "ind"
	}
	return s.repo.CreateTitle(ctx, t)
}

func (s *Service) UpdateTitle(ctx context.Context, t domain.Title) (domain.Title, error) {
	if t.Title == "" {
		return domain.Title{}, domain.ErrInvalidInput
	}
	return s.repo.UpdateTitle(ctx, t)
}

func (s *Service) GetTitle(ctx context.Context, tenantID, id uuid.UUID) (TitleWithAvailability, error) {
	title, found, err := s.repo.GetTitle(ctx, tenantID, id)
	if err != nil {
		return TitleWithAvailability{}, err
	}
	if !found {
		return TitleWithAvailability{}, domain.ErrTitleNotFound
	}
	return s.withAvailability(ctx, tenantID, title)
}

func (s *Service) ListTitles(ctx context.Context, tenantID uuid.UUID, search string, limit, offset int) ([]TitleWithAvailability, error) {
	limit = clampLimit(limit)
	titles, err := s.repo.ListTitles(ctx, tenantID, search, limit, offset)
	if err != nil {
		return nil, err
	}
	out := make([]TitleWithAvailability, len(titles))
	for i, t := range titles {
		out[i], err = s.withAvailability(ctx, tenantID, t)
		if err != nil {
			return nil, err
		}
	}
	return out, nil
}

func (s *Service) withAvailability(ctx context.Context, tenantID uuid.UUID, t domain.Title) (TitleWithAvailability, error) {
	total, err := s.repo.CountTitleCopies(ctx, tenantID, t.ID)
	if err != nil {
		return TitleWithAvailability{}, err
	}
	available, err := s.repo.CountAvailableCopies(ctx, tenantID, t.ID)
	if err != nil {
		return TitleWithAvailability{}, err
	}
	return TitleWithAvailability{Title: t, TotalCopies: total, AvailableCopies: available}, nil
}

func (s *Service) AddCopy(ctx context.Context, tenantID uuid.UUID, c domain.Copy) (domain.Copy, error) {
	if c.Barcode == "" {
		return domain.Copy{}, domain.ErrInvalidInput
	}
	if !c.Condition.Valid() {
		c.Condition = domain.ConditionGood
	}
	c.TenantID = tenantID
	if _, found, err := s.repo.GetTitle(ctx, tenantID, c.TitleID); err != nil {
		return domain.Copy{}, err
	} else if !found {
		return domain.Copy{}, domain.ErrTitleNotFound
	}
	return s.repo.CreateCopy(ctx, c)
}

func (s *Service) ListCopies(ctx context.Context, tenantID, titleID uuid.UUID) ([]domain.Copy, error) {
	return s.repo.ListCopiesForTitle(ctx, tenantID, titleID)
}

func clampLimit(limit int) int {
	if limit <= 0 {
		return 50
	}
	if limit > 200 {
		return 200
	}
	return limit
}
