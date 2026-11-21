package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
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

// business-rule guard clauses gate one write or one aggregated read;
// the branches are sequential guards, not nested decision logic, and
// the module's existing test suite already covers them. Left as-is
// here to avoid behaviour risk in a lint-only change.
//
//nolint:gocyclo // service method: several independent precondition/authorization/
func (s *Service) Dashboard(ctx context.Context, tenantID uuid.UUID) (Dashboard, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return Dashboard{}, err
	}
	// Every "today" figure and the series are read in the tenant's own
	// calendar day, as TodayVisitSummary is, so the dashboard and the
	// visits tab agree on what today is.
	loc := s.tenantLocation(ctx, tenantID)
	now := clock.Now(ctx, s.clock).In(loc)
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
		// Active on the school's today, a lapsed suspension included
		// (domain.Member.AsOf): read, never stored.
		activeMembers, err = s.repo.CountActiveMembersTotal(ctx, tenantID, domain.SchoolDay(now, loc))
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

		since := dayStart.AddDate(0, 0, -(dashboardSeriesDays - 1))
		loanSeries, err := s.repo.DailyLoansSeries(ctx, tenantID, since, loc)
		if err != nil {
			return err
		}
		returnSeries, err := s.repo.DailyReturnsSeries(ctx, tenantID, since, loc)
		if err != nil {
			return err
		}
		series = mergeSeries(since, dayStart, loanSeries, returnSeries)
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

// tenantLocation is the tenant's own time zone, so "today" means the
// school's calendar day; it falls back to UTC when the zone is unset or
// unknown.
func (s *Service) tenantLocation(ctx context.Context, tenantID uuid.UUID) *time.Location {
	tz, err := s.repo.GetTenantTimezone(ctx, tenantID)
	if err != nil {
		return time.UTC
	}
	return clock.Location(tz)
}

// schoolToday is the school's calendar day at instant now (in practice
// clock.Now, so a simulated time applies), as domain.SchoolDay builds it:
// the day every circulation date rule is decided on.
func (s *Service) schoolToday(ctx context.Context, tenantID uuid.UUID, now time.Time) time.Time {
	return domain.SchoolDay(now, s.tenantLocation(ctx, tenantID))
}

// mergeSeries combines the loans and returns series into one point per
// calendar day from first to last inclusive. A day with no loans or
// returns is absent from the query results and comes out as zero, so the
// chart always spans the whole window with evenly spaced days.
func mergeSeries(first, last time.Time, loans, returns []DaySeriesPoint) []DashboardSeriesPoint {
	loansByDay := make(map[string]int, len(loans))
	returnsByDay := make(map[string]int, len(returns))
	for _, p := range loans {
		loansByDay[p.Day.Format(time.DateOnly)] = p.Count
	}
	for _, p := range returns {
		returnsByDay[p.Day.Format(time.DateOnly)] = p.Count
	}
	var out []DashboardSeriesPoint
	for d := timeToDay(first); !d.After(last); d = d.AddDate(0, 0, 1) {
		day := d.Format(time.DateOnly)
		out = append(out, DashboardSeriesPoint{Day: day, Loans: loansByDay[day], Returns: returnsByDay[day]})
	}
	return out
}
