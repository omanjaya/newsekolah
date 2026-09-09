package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
)

// LoansInPeriod is the loans-per-period report: every loan that started in
// [from, to).
func (s *Service) LoansInPeriod(ctx context.Context, tenantID uuid.UUID, from, to time.Time) ([]domain.Loan, error) {
	return s.repo.ListLoansInPeriod(ctx, tenantID, from, to)
}

// OverdueMemberSummary groups a tenant's overdue loans by member.
type OverdueMemberSummary struct {
	MemberUserID uuid.UUID
	LoanCount    int
	TotalFine    int
}

// OverdueMembers is the overdue-members report: every member with at least
// one active loan past its due date, with the fine each loan would carry
// if returned today.
func (s *Service) OverdueMembers(ctx context.Context, tenantID uuid.UUID) ([]OverdueMemberSummary, error) {
	policy, err := s.Policy(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	overdue, err := s.repo.ListOverdueLoans(ctx, tenantID, s.clock.Now())
	if err != nil {
		return nil, err
	}
	now := s.clock.Now()
	byMember := make(map[uuid.UUID]*OverdueMemberSummary)
	order := make([]uuid.UUID, 0)
	for _, loan := range overdue {
		summary, ok := byMember[loan.MemberUserID]
		if !ok {
			summary = &OverdueMemberSummary{MemberUserID: loan.MemberUserID}
			byMember[loan.MemberUserID] = summary
			order = append(order, loan.MemberUserID)
		}
		summary.LoanCount++
		summary.TotalFine += domain.CalculateFine(policy, loan.DueOn, now)
	}
	out := make([]OverdueMemberSummary, len(order))
	for i, id := range order {
		out[i] = *byMember[id]
	}
	return out, nil
}

// MostBorrowedTitle is one row of the most-borrowed-titles report.
type MostBorrowedTitle struct {
	Title     TitleWithAvailability
	LoanCount int
}

func (s *Service) MostBorrowedTitles(ctx context.Context, tenantID uuid.UUID, from, to time.Time, limit int) ([]MostBorrowedTitle, error) {
	counts, err := s.repo.MostBorrowedTitles(ctx, tenantID, from, to, clampLimit(limit))
	if err != nil {
		return nil, err
	}
	out := make([]MostBorrowedTitle, 0, len(counts))
	for _, c := range counts {
		title, found, err := s.repo.GetTitle(ctx, tenantID, c.TitleID)
		if err != nil {
			return nil, err
		}
		if !found {
			continue
		}
		withAvailability, err := s.withAvailability(ctx, tenantID, title)
		if err != nil {
			return nil, err
		}
		out = append(out, MostBorrowedTitle{Title: withAvailability, LoanCount: c.LoanCount})
	}
	return out, nil
}
