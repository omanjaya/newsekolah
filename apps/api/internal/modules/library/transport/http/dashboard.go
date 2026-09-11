package http

import (
	"context"
	"time"

	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
)

func (h *LibraryHandler) GetLibraryDashboard(ctx context.Context, _ api.GetLibraryDashboardRequestObject) (api.GetLibraryDashboardResponseObject, error) {
	d, err := h.service.Dashboard(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	latest := make([]api.LibraryLoan, len(d.LatestLoans))
	for i, l := range d.LatestLoans {
		latest[i] = toAPILoan(l)
	}
	overdue := make([]api.LibraryLoan, len(d.LongestOverdue))
	for i, l := range d.LongestOverdue {
		overdue[i] = toAPILoan(l)
	}
	popular := make([]api.LibraryMostBorrowedTitle, len(d.PopularTitles))
	for i, t := range d.PopularTitles {
		popular[i] = api.LibraryMostBorrowedTitle{Title: toAPITitle(t.Title), LoanCount: t.LoanCount}
	}
	series := make([]api.LibraryDashboardSeriesPoint, len(d.Series))
	for i, p := range d.Series {
		day, err := parseISODate(p.Day)
		if err != nil {
			return nil, mapError(err)
		}
		series[i] = api.LibraryDashboardSeriesPoint{Day: day, Loans: p.Loans, Returns: p.Returns}
	}
	return api.GetLibraryDashboard200JSONResponse{
		Summary: api.LibraryDashboardSummary{
			Titles: d.Summary.Titles, Copies: d.Summary.Copies, Available: d.Summary.Available, OnLoan: d.Summary.OnLoan,
			Overdue: d.Summary.Overdue, Members: d.Summary.Members, ActiveMembers: d.Summary.ActiveMembers,
			VisitsToday: d.Summary.VisitsToday, LoansToday: d.Summary.LoansToday, ReturnsToday: d.Summary.ReturnsToday,
			UnpaidFinesTotal: d.Summary.UnpaidFinesTotal,
		},
		LatestLoans: latest, LongestOverdue: overdue, PopularTitles: popular, Series: series,
	}, nil
}

func parseISODate(s string) (openapi_types.Date, error) {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return openapi_types.Date{}, err
	}
	return openapi_types.Date{Time: t}, nil
}
