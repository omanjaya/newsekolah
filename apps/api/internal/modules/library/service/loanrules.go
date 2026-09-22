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
	var created domain.LoanRule
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		created, err = s.repo.CreateLoanRule(ctx, rule)
		return err
	})
	return created, err
}

func (s *Service) DeleteLoanRule(ctx context.Context, tenantID, id uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.DeleteLoanRule(ctx, tenantID, id)
	})
}

// ListActiveLoanRules returns every rule not yet fully expired, for the
// settings screen to review or delete.
func (s *Service) ListActiveLoanRules(ctx context.Context, tenantID uuid.UUID) ([]domain.LoanRule, error) {
	var rules []domain.LoanRule
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		rules, err = s.repo.ListLoanRulesActive(ctx, tenantID, s.clock.Now())
		return err
	})
	return rules, err
}
