package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
)

func (s *Service) CreateLoanRule(ctx context.Context, tenantID uuid.UUID, rule domain.LoanRule) (domain.LoanRule, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return domain.LoanRule{}, err
	}
	if !rule.EndsOn.After(rule.StartsOn) && !rule.EndsOn.Equal(rule.StartsOn) {
		return domain.LoanRule{}, domain.ErrInvalidInput
	}
	rule.TenantID = tenantID
	return s.repo.CreateLoanRule(ctx, rule)
}

func (s *Service) DeleteLoanRule(ctx context.Context, tenantID, id uuid.UUID) error {
	return s.repo.DeleteLoanRule(ctx, tenantID, id)
}

// ListActiveLoanRules returns every rule not yet fully expired, for the
// settings screen to review or delete.
func (s *Service) ListActiveLoanRules(ctx context.Context, tenantID uuid.UUID) ([]domain.LoanRule, error) {
	return s.repo.ListLoanRulesActive(ctx, tenantID, s.clock.Now())
}
