package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
)

// reportDefaultDays is the old app's default report window when from/to
// are left off: the last 30 days, inclusive of "to" (library_reports.go).
const reportDefaultDays = 30

// resolveReportPeriod fills in a missing from/to the way the old app did:
// "to" defaults to today, "from" to 30 days before "to", and the range
// returned is a half-open [from, toExclusive) where toExclusive is the
// day after "to" -- so a caller filtering with >= from and < toExclusive
// still includes everything that happened on "to" itself.
func (s *Service) resolveReportPeriod(from, to *time.Time) (time.Time, time.Time) {
	now := s.clock.Now()
	var toDay time.Time
	if to != nil {
		toDay = *to
	} else {
		toDay = now
	}
	toDay = time.Date(toDay.Year(), toDay.Month(), toDay.Day(), 0, 0, 0, 0, toDay.Location())
	var fromDay time.Time
	if from != nil {
		fromDay = *from
	} else {
		fromDay = toDay.AddDate(0, 0, -reportDefaultDays)
	}
	fromDay = time.Date(fromDay.Year(), fromDay.Month(), fromDay.Day(), 0, 0, 0, 0, fromDay.Location())
	return fromDay, toDay.AddDate(0, 0, 1)
}

// LoanReportRow is one loans-in-period report row with the member's
// display name and the title already resolved, so the printed/exported
// report never shows a bare UUID.
type LoanReportRow struct {
	Loan       domain.Loan
	Title      string
	MemberName string
}

// LoansInPeriod is the loans-per-period report: every loan that started
// in [from, to], with from/to defaulting to the last 30 days (inclusive
// of "to") when left off.
func (s *Service) LoansInPeriod(ctx context.Context, tenantID uuid.UUID, from, to *time.Time) ([]LoanReportRow, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	fromDay, toExclusive := s.resolveReportPeriod(from, to)
	rows, err := s.repo.ListLoansInPeriodWithTitle(ctx, tenantID, fromDay, toExclusive)
	if err != nil {
		return nil, err
	}
	out := make([]LoanReportRow, len(rows))
	for i, r := range rows {
		name := r.Loan.MemberUserID.String()
		if s.members != nil {
			if resolved, err := s.members.UserDisplayName(ctx, tenantID, r.Loan.MemberUserID); err == nil && resolved != "" {
				name = resolved
			}
		}
		out[i] = LoanReportRow{Loan: r.Loan, Title: r.Title, MemberName: name}
	}
	return out, nil
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
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
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

func (s *Service) MostBorrowedTitles(ctx context.Context, tenantID uuid.UUID, from, to *time.Time, limit int) ([]MostBorrowedTitle, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	fromDay, toExclusive := s.resolveReportPeriod(from, to)
	counts, err := s.repo.MostBorrowedTitles(ctx, tenantID, fromDay, toExclusive, clampLimit(limit))
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

// CatalogueSummary is the accreditation-style summary report: catalogue
// composition and this period's circulation activity. students_total,
// members_total, and the per-student ratios the old app computed from
// them are intentionally left out -- they need the circulation half's
// member/enrollment tables, which this half of the module does not read.
type CatalogueSummary struct {
	TitlesByDDC         []DDCClassCount
	ItemsByCategory     []MasterEntryCount
	ItemsByMaterialType []MasterEntryCount
	FictionCount        int
	FictionTotal        int
	AdditionsInPeriod   int
	LoansInPeriod       int
	ActiveBorrowers     int
	OverdueNow          int
	LastStocktake       *domain.Stocktake
}

func (s *Service) CatalogueSummary(ctx context.Context, tenantID uuid.UUID, from, to *time.Time) (CatalogueSummary, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return CatalogueSummary{}, err
	}
	fromDay, toExclusive := s.resolveReportPeriod(from, to)
	byDDC, err := s.repo.TitlesByDDCClass(ctx, tenantID)
	if err != nil {
		return CatalogueSummary{}, err
	}
	byCategory, err := s.repo.ItemsByCategory(ctx, tenantID)
	if err != nil {
		return CatalogueSummary{}, err
	}
	byMaterialType, err := s.repo.ItemsByMaterialType(ctx, tenantID)
	if err != nil {
		return CatalogueSummary{}, err
	}
	fiction, total, err := s.repo.FictionRatioCounts(ctx, tenantID)
	if err != nil {
		return CatalogueSummary{}, err
	}
	additions, err := s.repo.CountTitlesAddedInPeriod(ctx, tenantID, fromDay, toExclusive)
	if err != nil {
		return CatalogueSummary{}, err
	}
	loans, err := s.repo.ListLoansInPeriod(ctx, tenantID, fromDay, toExclusive)
	if err != nil {
		return CatalogueSummary{}, err
	}
	activeBorrowers, err := s.repo.CountActiveBorrowers(ctx, tenantID)
	if err != nil {
		return CatalogueSummary{}, err
	}
	overdue, err := s.repo.CountOverdueNow(ctx, tenantID, s.clock.Now())
	if err != nil {
		return CatalogueSummary{}, err
	}
	lastStocktake, found, err := s.repo.GetLastClosedStocktake(ctx, tenantID)
	if err != nil {
		return CatalogueSummary{}, err
	}
	summary := CatalogueSummary{
		TitlesByDDC: byDDC, ItemsByCategory: byCategory, ItemsByMaterialType: byMaterialType,
		FictionCount: fiction, FictionTotal: total, AdditionsInPeriod: additions, LoansInPeriod: len(loans),
		ActiveBorrowers: activeBorrowers, OverdueNow: overdue,
	}
	if found {
		summary.LastStocktake = &lastStocktake
	}
	return summary, nil
}

// AccessionRegister is the accession register (Buku Induk): every copy
// acquired in the period, in acquisition order. acquired_on is a date
// column, so unlike the timestamp-based reports this compares with an
// inclusive upper bound rather than the day-after used for [from, to).
func (s *Service) AccessionRegister(ctx context.Context, tenantID uuid.UUID, from, to *time.Time) ([]domain.Copy, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	fromDay, toExclusive := s.resolveReportPeriod(from, to)
	toInclusive := toExclusive.AddDate(0, 0, -1)
	return s.repo.ListCopiesAcquiredInPeriod(ctx, tenantID, fromDay, toInclusive)
}
