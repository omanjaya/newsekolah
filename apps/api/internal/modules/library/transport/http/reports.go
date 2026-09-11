package http

import (
	"bytes"
	"context"
	"time"

	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
)

// reportPeriod extracts an optional from/to date pair, the shape every
// period-scoped report endpoint's params share.
func reportPeriod(from, to *openapi_types.Date) (*time.Time, *time.Time) {
	var f, t *time.Time
	if from != nil {
		f = &from.Time
	}
	if to != nil {
		t = &to.Time
	}
	return f, t
}

func (h *LibraryHandler) GetLibraryLoansReport(ctx context.Context, request api.GetLibraryLoansReportRequestObject) (api.GetLibraryLoansReportResponseObject, error) {
	from, to := reportPeriod(request.Params.From, request.Params.To)
	rows, err := h.service.LoansInPeriod(ctx, tenantID(ctx), from, to)
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LibraryLoanReportRow, len(rows))
	for i, r := range rows {
		data[i] = api.LibraryLoanReportRow{Loan: toAPILoan(r.Loan), Title: r.Title, MemberName: r.MemberName}
	}
	return api.GetLibraryLoansReport200JSONResponse{Data: data}, nil
}

func (h *LibraryHandler) GetLibraryLoansReportXlsx(ctx context.Context, request api.GetLibraryLoansReportXlsxRequestObject) (api.GetLibraryLoansReportXlsxResponseObject, error) {
	from, to := reportPeriod(request.Params.From, request.Params.To)
	xlsx, err := h.service.LoansReportXLSX(ctx, tenantID(ctx), from, to)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetLibraryLoansReportXlsx200ApplicationvndOpenxmlformatsOfficedocumentSpreadsheetmlSheetResponse{
		Body: bytes.NewReader(xlsx), ContentLength: int64(len(xlsx)),
	}, nil
}

func (h *LibraryHandler) GetLibraryOverdueMembersReport(ctx context.Context, _ api.GetLibraryOverdueMembersReportRequestObject) (api.GetLibraryOverdueMembersReportResponseObject, error) {
	members, err := h.service.OverdueMembers(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LibraryOverdueMember, len(members))
	for i, m := range members {
		data[i] = api.LibraryOverdueMember{MemberUserId: m.MemberUserID, LoanCount: m.LoanCount, TotalFine: m.TotalFine}
	}
	return api.GetLibraryOverdueMembersReport200JSONResponse{Data: data}, nil
}

func (h *LibraryHandler) GetLibraryOverdueMembersReportXlsx(ctx context.Context, _ api.GetLibraryOverdueMembersReportXlsxRequestObject) (api.GetLibraryOverdueMembersReportXlsxResponseObject, error) {
	xlsx, err := h.service.OverdueMembersReportXLSX(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetLibraryOverdueMembersReportXlsx200ApplicationvndOpenxmlformatsOfficedocumentSpreadsheetmlSheetResponse{
		Body: bytes.NewReader(xlsx), ContentLength: int64(len(xlsx)),
	}, nil
}

func (h *LibraryHandler) GetLibraryMostBorrowedReport(ctx context.Context, request api.GetLibraryMostBorrowedReportRequestObject) (api.GetLibraryMostBorrowedReportResponseObject, error) {
	from, to := reportPeriod(request.Params.From, request.Params.To)
	report, err := h.service.PopularReport(ctx, tenantID(ctx), from, to, intOr(request.Params.Limit, 20))
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetLibraryMostBorrowedReport200JSONResponse{
		Data: toAPIMostBorrowedTitles(report.Titles), TopBorrowers: toAPITopBorrowers(report.Borrowers),
	}, nil
}

func (h *LibraryHandler) GetLibraryMostBorrowedReportXlsx(ctx context.Context, request api.GetLibraryMostBorrowedReportXlsxRequestObject) (api.GetLibraryMostBorrowedReportXlsxResponseObject, error) {
	from, to := reportPeriod(request.Params.From, request.Params.To)
	xlsx, err := h.service.MostBorrowedReportXLSX(ctx, tenantID(ctx), from, to, intOr(request.Params.Limit, 20))
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetLibraryMostBorrowedReportXlsx200ApplicationvndOpenxmlformatsOfficedocumentSpreadsheetmlSheetResponse{
		Body: bytes.NewReader(xlsx), ContentLength: int64(len(xlsx)),
	}, nil
}

func (h *LibraryHandler) GetLibraryCatalogueSummaryReport(ctx context.Context, request api.GetLibraryCatalogueSummaryReportRequestObject) (api.GetLibraryCatalogueSummaryReportResponseObject, error) {
	from, to := reportPeriod(request.Params.From, request.Params.To)
	summary, err := h.service.CatalogueSummary(ctx, tenantID(ctx), from, to)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetLibraryCatalogueSummaryReport200JSONResponse(toAPICatalogueSummary(summary)), nil
}

func (h *LibraryHandler) GetLibraryCatalogueSummaryReportXlsx(ctx context.Context, request api.GetLibraryCatalogueSummaryReportXlsxRequestObject) (api.GetLibraryCatalogueSummaryReportXlsxResponseObject, error) {
	from, to := reportPeriod(request.Params.From, request.Params.To)
	xlsx, err := h.service.CatalogueSummaryXLSX(ctx, tenantID(ctx), from, to)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetLibraryCatalogueSummaryReportXlsx200ApplicationvndOpenxmlformatsOfficedocumentSpreadsheetmlSheetResponse{
		Body: bytes.NewReader(xlsx), ContentLength: int64(len(xlsx)),
	}, nil
}

func (h *LibraryHandler) GetLibraryVisitsReport(ctx context.Context, request api.GetLibraryVisitsReportRequestObject) (api.GetLibraryVisitsReportResponseObject, error) {
	from, to := reportPeriod(request.Params.From, request.Params.To)
	report, err := h.service.VisitsReport(ctx, tenantID(ctx), from, to)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetLibraryVisitsReport200JSONResponse(toAPIVisitsReport(report)), nil
}

func (h *LibraryHandler) GetLibraryVisitsReportXlsx(ctx context.Context, request api.GetLibraryVisitsReportXlsxRequestObject) (api.GetLibraryVisitsReportXlsxResponseObject, error) {
	from, to := reportPeriod(request.Params.From, request.Params.To)
	xlsx, err := h.service.VisitsReportXLSX(ctx, tenantID(ctx), from, to)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetLibraryVisitsReportXlsx200ApplicationvndOpenxmlformatsOfficedocumentSpreadsheetmlSheetResponse{
		Body: bytes.NewReader(xlsx), ContentLength: int64(len(xlsx)),
	}, nil
}

func (h *LibraryHandler) GetLibraryMembersReport(ctx context.Context, _ api.GetLibraryMembersReportRequestObject) (api.GetLibraryMembersReportResponseObject, error) {
	report, err := h.service.MembersReport(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetLibraryMembersReport200JSONResponse(toAPIMembersReport(report)), nil
}

func (h *LibraryHandler) GetLibraryMembersReportXlsx(ctx context.Context, _ api.GetLibraryMembersReportXlsxRequestObject) (api.GetLibraryMembersReportXlsxResponseObject, error) {
	xlsx, err := h.service.MembersReportXLSX(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetLibraryMembersReportXlsx200ApplicationvndOpenxmlformatsOfficedocumentSpreadsheetmlSheetResponse{
		Body: bytes.NewReader(xlsx), ContentLength: int64(len(xlsx)),
	}, nil
}

func (h *LibraryHandler) GetLibraryMonthlyReport(ctx context.Context, request api.GetLibraryMonthlyReportRequestObject) (api.GetLibraryMonthlyReportResponseObject, error) {
	month := ""
	if request.Params.Month != nil {
		month = *request.Params.Month
	}
	pdf, err := h.service.MonthlyReportPDF(ctx, tenantID(ctx), month)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetLibraryMonthlyReport200ApplicationpdfResponse{
		Body: bytes.NewReader(pdf), ContentLength: int64(len(pdf)),
	}, nil
}

func (h *LibraryHandler) GetLibraryAccessionRegisterReport(ctx context.Context, request api.GetLibraryAccessionRegisterReportRequestObject) (api.GetLibraryAccessionRegisterReportResponseObject, error) {
	from, to := reportPeriod(request.Params.From, request.Params.To)
	copies, err := h.service.AccessionRegister(ctx, tenantID(ctx), from, to)
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LibraryCopy, len(copies))
	for i, c := range copies {
		data[i] = toAPICopy(c)
	}
	return api.GetLibraryAccessionRegisterReport200JSONResponse{Data: data}, nil
}

func (h *LibraryHandler) GetLibraryAccessionRegisterReportXlsx(ctx context.Context, request api.GetLibraryAccessionRegisterReportXlsxRequestObject) (api.GetLibraryAccessionRegisterReportXlsxResponseObject, error) {
	from, to := reportPeriod(request.Params.From, request.Params.To)
	xlsx, err := h.service.AccessionRegisterXLSX(ctx, tenantID(ctx), from, to)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetLibraryAccessionRegisterReportXlsx200ApplicationvndOpenxmlformatsOfficedocumentSpreadsheetmlSheetResponse{
		Body: bytes.NewReader(xlsx), ContentLength: int64(len(xlsx)),
	}, nil
}

func (h *LibraryHandler) ExportLibraryCatalogueXlsx(ctx context.Context, _ api.ExportLibraryCatalogueXlsxRequestObject) (api.ExportLibraryCatalogueXlsxResponseObject, error) {
	xlsx, err := h.service.CatalogueExportXLSX(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.ExportLibraryCatalogueXlsx200ApplicationvndOpenxmlformatsOfficedocumentSpreadsheetmlSheetResponse{
		Body: bytes.NewReader(xlsx), ContentLength: int64(len(xlsx)),
	}, nil
}

func toAPIMostBorrowedTitles(titles []service.MostBorrowedTitle) []api.LibraryMostBorrowedTitle {
	out := make([]api.LibraryMostBorrowedTitle, len(titles))
	for i, t := range titles {
		out[i] = api.LibraryMostBorrowedTitle{Title: toAPITitle(t.Title), LoanCount: t.LoanCount}
	}
	return out
}

func toAPITopBorrowers(borrowers []service.TopBorrower) []api.LibraryTopBorrower {
	out := make([]api.LibraryTopBorrower, len(borrowers))
	for i, b := range borrowers {
		out[i] = api.LibraryTopBorrower{
			MemberUserId: b.MemberUserID, MemberName: b.MemberName, ClassName: b.ClassName, LoanCount: b.LoanCount,
		}
	}
	return out
}

func toAPIClassCounts(counts []service.ClassCount) []api.LibraryClassCount {
	out := make([]api.LibraryClassCount, len(counts))
	for i, c := range counts {
		out[i] = api.LibraryClassCount{ClassName: c.ClassName, Count: c.Count}
	}
	return out
}

func toAPIVisitsReport(r service.VisitsReport) api.LibraryVisitsReport {
	perDay := make([]api.LibraryDayCount, len(r.PerDay))
	for i, d := range r.PerDay {
		perDay[i] = api.LibraryDayCount{Day: openapi_types.Date{Time: d.Day}, Count: d.Count}
	}
	return api.LibraryVisitsReport{Total: r.Total, PerDay: perDay, PerClass: toAPIClassCounts(r.PerClass)}
}

func toAPIMembersReport(r service.MembersReport) api.LibraryMembersReport {
	perType := make([]api.LibraryMemberTypeCount, len(r.PerType))
	for i, t := range r.PerType {
		perType[i] = api.LibraryMemberTypeCount{Id: t.ID, Name: t.Name, Count: t.Count}
	}
	return api.LibraryMembersReport{Total: r.Total, Active: r.Active, PerType: perType, PerClass: toAPIClassCounts(r.PerClass)}
}

func toAPICatalogueSummary(s service.CatalogueSummary) api.LibraryCatalogueSummary {
	byDDC := make([]api.LibraryDDCClassCount, len(s.TitlesByDDC))
	for i, c := range s.TitlesByDDC {
		byDDC[i] = api.LibraryDDCClassCount{Code: c.Code, Name: c.Name, TitleCount: c.TitleCount}
	}
	byCategory := make([]api.LibraryMasterEntryCount, len(s.ItemsByCategory))
	for i, c := range s.ItemsByCategory {
		byCategory[i] = api.LibraryMasterEntryCount{Id: c.ID, Code: c.Code, Name: c.Name, Count: c.Count}
	}
	byMaterialType := make([]api.LibraryMasterEntryCount, len(s.ItemsByMaterialType))
	for i, c := range s.ItemsByMaterialType {
		byMaterialType[i] = api.LibraryMasterEntryCount{Id: c.ID, Code: c.Code, Name: c.Name, Count: c.Count}
	}
	out := api.LibraryCatalogueSummary{
		TitlesByDdc: byDDC, ItemsByCategory: byCategory, ItemsByMaterialType: byMaterialType,
		FictionCount: s.FictionCount, FictionTotal: s.FictionTotal, AdditionsInPeriod: s.AdditionsInPeriod,
		LoansInPeriod: s.LoansInPeriod, ActiveBorrowers: s.ActiveBorrowers, OverdueNow: s.OverdueNow,
		StudentsTotal: s.StudentsTotal, MembersTotal: s.MembersTotal, ItemsPerStudent: s.ItemsPerStudent,
		LoansPerStudent: s.LoansPerStudent, VisitsInPeriod: s.VisitsInPeriod, VisitsPerStudent: s.VisitsPerStudent,
	}
	if s.LastStocktake != nil {
		last := toAPIStocktake(*s.LastStocktake)
		out.LastStocktake = &last
	}
	return out
}
