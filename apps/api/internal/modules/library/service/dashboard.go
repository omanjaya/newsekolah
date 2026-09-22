package service

import (
	"context"
	"sort"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
)

// dashboardSeriesDays mirrors the old app's dashboard trend window.
const dashboardSeriesDays = 30

// DashboardSummary is the library dashboard's headline counts (old app:
// library_operations.go's GET /library/dashboard).
type DashboardSummary struct {
	Titles           int
	Copies           int
	Available        int
	OnLoan           int
	Overdue          int
	Members          int
	ActiveMembers    int
	VisitsToday      int
	LoansToday       int
	ReturnsToday     int
	UnpaidFinesTotal int
}

// DashboardSeriesPoint is one day of the dashboard's 30-day trend.
type DashboardSeriesPoint struct {
	Day     string
	Loans   int
	Returns int
}

// Dashboard is the library module's summary screen: headline counts,
// recent activity, and a 30-day trend (old app: library_operations.go's
// GET /library/dashboard).
type Dashboard struct {
	Summary        DashboardSummary
	LatestLoans    []domain.Loan
	LongestOverdue []domain.Loan
	PopularTitles  []MostBorrowedTitle
	Series         []DashboardSeriesPoint
}

func (s *Service) Dashboard(ctx context.Context, tenantID uuid.UUID) (Dashboard, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return Dashboard{}, err
	}
	now := s.clock.Now()
	dayStart := timeToDay(now)
	dayEnd := dayStart.AddDate(0, 0, 1)

	var (
		titles, copies, available, onLoan, overdue int
		loansToday, returnsToday, unpaidFines      int
		members, activeMembers, visitsToday        int
		latestLoans, longestOverdue                []domain.Loan
		popular                                    []MostBorrowedTitle
		series                                     []DashboardSeriesPoint
	)
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		titles, err = s.repo.CountTitlesActive(ctx, tenantID)
		if err != nil {
			return err
		}
		copies, err = s.repo.CountCopiesTotal(ctx, tenantID)
		if err != nil {
			return err
		}
		available, err = s.repo.CountCopiesByStatus(ctx, tenantID, domain.CopyAvailable)
		if err != nil {
			return err
		}
		onLoan, err = s.repo.CountCopiesByStatus(ctx, tenantID, domain.CopyOnLoan)
		if err != nil {
			return err
		}
		overdue, err = s.repo.CountOverdueNow(ctx, tenantID, now)
		if err != nil {
			return err
		}
		loansToday, err = s.repo.CountLoansBetween(ctx, tenantID, dayStart, dayEnd)
		if err != nil {
			return err
		}
		returnsToday, err = s.repo.CountReturnsBetween(ctx, tenantID, dayStart, dayEnd)
		if err != nil {
			return err
		}
		unpaidFines, err = s.repo.SumUnpaidFines(ctx, tenantID)
		if err != nil {
			return err
		}
		members, err = s.repo.CountMembersTotal(ctx, tenantID)
		if err != nil {
			return err
		}
		activeMembers, err = s.repo.CountActiveMembersTotal(ctx, tenantID)
		if err != nil {
			return err
		}
		visitsToday, err = s.repo.CountVisitsBetween(ctx, tenantID, dayStart, dayEnd)
		if err != nil {
			return err
		}
		latestLoans, err = s.repo.ListLatestLoans(ctx, tenantID, 10)
		if err != nil {
			return err
		}
		longestOverdue, err = s.repo.ListLongestOverdueLoans(ctx, tenantID, now, 10)
		if err != nil {
			return err
		}
		popularCounts, err := s.repo.PopularTitlesAllTime(ctx, tenantID, 10)
		if err != nil {
			return err
		}
		popular = make([]MostBorrowedTitle, 0, len(popularCounts))
		for _, c := range popularCounts {
			title, found, err := s.repo.GetTitle(ctx, tenantID, c.TitleID)
			if err != nil {
				return err
			}
			if !found {
				continue
			}
			withAvailability, err := s.withAvailability(ctx, tenantID, title)
			if err != nil {
				return err
			}
			popular = append(popular, MostBorrowedTitle{Title: withAvailability, LoanCount: c.LoanCount})
		}

		since := dayStart.AddDate(0, 0, -dashboardSeriesDays)
		loanSeries, err := s.repo.DailyLoansSeries(ctx, tenantID, since)
		if err != nil {
			return err
		}
		returnSeries, err := s.repo.DailyReturnsSeries(ctx, tenantID, since)
		if err != nil {
			return err
		}
		series = mergeSeries(loanSeries, returnSeries)
		return nil
	})
	if err != nil {
		return Dashboard{}, err
	}

	return Dashboard{
		Summary: DashboardSummary{
			Titles: titles, Copies: copies, Available: available, OnLoan: onLoan, Overdue: overdue,
			Members: members, ActiveMembers: activeMembers, VisitsToday: visitsToday,
			LoansToday: loansToday, ReturnsToday: returnsToday, UnpaidFinesTotal: unpaidFines,
		},
		LatestLoans: latestLoans, LongestOverdue: longestOverdue, PopularTitles: popular, Series: series,
	}, nil
}

func timeToDay(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location())
}

// mergeSeries combines the loans and returns series (which may have
// different sets of days, since a day with zero loans is simply absent
// from that series) into one ordered list of points.
func mergeSeries(loans, returns []DaySeriesPoint) []DashboardSeriesPoint {
	loansByDay := make(map[string]int, len(loans))
	returnsByDay := make(map[string]int, len(returns))
	order := make([]string, 0, len(loans)+len(returns))
	seen := make(map[string]bool)
	for _, p := range loans {
		day := p.Day.Format("2006-01-02")
		loansByDay[day] = p.Count
		if !seen[day] {
			seen[day] = true
			order = append(order, day)
		}
	}
	for _, p := range returns {
		day := p.Day.Format("2006-01-02")
		returnsByDay[day] = p.Count
		if !seen[day] {
			seen[day] = true
			order = append(order, day)
		}
	}
	sort.Strings(order)
	out := make([]DashboardSeriesPoint, len(order))
	for i, day := range order {
		out[i] = DashboardSeriesPoint{Day: day, Loans: loansByDay[day], Returns: returnsByDay[day]}
	}
	return out
}
