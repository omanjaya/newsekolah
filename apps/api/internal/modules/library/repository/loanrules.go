package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func (r *Repository) CreateLoanRule(ctx context.Context, rule domain.LoanRule) (domain.LoanRule, error) {
	params := db.CreateLoanRuleParams{
		TenantID: rule.TenantID, MemberTypeID: pdatabase.NullUUID(rule.MemberTypeID), StartsOn: pdatabase.Date(rule.StartsOn),
		EndsOn: pdatabase.Date(rule.EndsOn), AllowLoans: rule.AllowLoans, Notes: rule.Notes, CreatedBy: pdatabase.NullUUID(rule.CreatedBy),
	}
	if rule.MaxLoanItems != nil {
		params.MaxLoanItems = pgtype.Int4{Int32: int32(*rule.MaxLoanItems), Valid: true} //nolint:gosec // validated positive
	}
	if rule.MaxLoanDays != nil {
		params.MaxLoanDays = pgtype.Int4{Int32: int32(*rule.MaxLoanDays), Valid: true} //nolint:gosec // validated positive
	}
	row, err := r.queries(ctx).CreateLoanRule(ctx, params)
	if err != nil {
		return domain.LoanRule{}, fmt.Errorf("create loan rule: %w", err)
	}
	return toLoanRule(row), nil
}

func (r *Repository) DeleteLoanRule(ctx context.Context, tenantID, id uuid.UUID) error {
	if _, err := r.queries(ctx).DeleteLoanRule(ctx, db.DeleteLoanRuleParams{TenantID: tenantID, ID: id}); err != nil {
		return fmt.Errorf("delete loan rule: %w", err)
	}
	return nil
}

// ListLoanRulesActive returns every rule that has not fully expired as of
// asOf, for the service to resolve against a specific date and member type.
func (r *Repository) ListLoanRulesActive(ctx context.Context, tenantID uuid.UUID, asOf time.Time) ([]domain.LoanRule, error) {
	rows, err := r.queries(ctx).ListLoanRulesActive(ctx, db.ListLoanRulesActiveParams{TenantID: tenantID, EndsOn: pdatabase.Date(asOf)})
	if err != nil {
		return nil, fmt.Errorf("list active loan rules: %w", err)
	}
	out := make([]domain.LoanRule, len(rows))
	for i, row := range rows {
		out[i] = toLoanRule(row)
	}
	return out, nil
}
