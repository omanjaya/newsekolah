// Package http adapts the generated strict-server interface to the
// library service.
package http

import (
	"context"
	"errors"

	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

type LibraryHandler struct{ service *service.Service }

func New(svc *service.Service) *LibraryHandler { return &LibraryHandler{service: svc} }

func tenantID(ctx context.Context) uuid.UUID { id, _ := httpx.TenantIDFromContext(ctx); return id }
func userID(ctx context.Context) uuid.UUID   { id, _ := httpx.UserIDFromContext(ctx); return id }

var errorMap = map[error]*httpx.Error{
	domain.ErrTitleNotFound:          httpx.ErrLibraryTitleNotFound,
	domain.ErrTitleHasCopies:         httpx.ErrLibraryTitleHasCopies,
	domain.ErrControlNumberExists:    httpx.ErrLibraryControlNumberExists,
	domain.ErrCopyNotFound:           httpx.ErrLibraryCopyNotFound,
	domain.ErrCopyBarcodeExists:      httpx.ErrLibraryCopyBarcodeExists,
	domain.ErrCopyAccessionExists:    httpx.ErrLibraryCopyAccessionExists,
	domain.ErrCopyNotAvailable:       httpx.ErrLibraryCopyNotAvailable,
	domain.ErrCopyOnLoan:             httpx.ErrLibraryCopyOnLoan,
	domain.ErrCopyHasLoanHistory:     httpx.ErrLibraryCopyHasLoanHistory,
	domain.ErrCopyStatusNotManual:    httpx.ErrLibraryCopyStatusNotManual,
	domain.ErrLoanNotFound:           httpx.ErrLibraryLoanNotFound,
	domain.ErrLoanAlreadyReturned:    httpx.ErrLibraryLoanAlreadyReturned,
	domain.ErrLoanLimitReached:       httpx.ErrLibraryLoanLimitReached,
	domain.ErrRenewalLimitReached:    httpx.ErrLibraryRenewalLimitReached,
	domain.ErrRenewalBlockedOverdue:  httpx.ErrLibraryRenewalBlockedOverdue,
	domain.ErrRenewalBlockedReserved: httpx.ErrLibraryRenewalBlockedReserved,
	domain.ErrReservationNotFound:    httpx.ErrLibraryReservationNotFound,
	domain.ErrReservationNotWaiting:  httpx.ErrLibraryReservationNotWaiting,
	domain.ErrCopyAvailableForLoan:   httpx.ErrLibraryCopyAvailableForLoan,
	domain.ErrStocktakeNotFound:      httpx.ErrLibraryStocktakeNotFound,
	domain.ErrStocktakeClosed:        httpx.ErrLibraryStocktakeClosed,
	domain.ErrMasterDataNotFound:     httpx.ErrLibraryMasterDataNotFound,
	domain.ErrMasterDataCodeExists:   httpx.ErrLibraryMasterDataCodeExists,
	domain.ErrMasterDataInUse:        httpx.ErrLibraryMasterDataInUse,
	domain.ErrInvalidInput:           httpx.ErrValidation,
}

func mapError(err error) error {
	for d, h := range errorMap {
		if errors.Is(err, d) {
			return h
		}
	}
	var appErr *httpx.Error
	if errors.As(err, &appErr) {
		return appErr
	}
	return httpx.Internal(err)
}

func strOr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func intOr(p *int, def int) int {
	if p == nil {
		return def
	}
	return *p
}

func boolOr(p *bool, def bool) bool {
	if p == nil {
		return def
	}
	return *p
}

func nullUUID(p *openapi_types.UUID) uuid.NullUUID {
	if p == nil {
		return uuid.NullUUID{}
	}
	return uuid.NullUUID{UUID: uuid.UUID(*p), Valid: true}
}

func apiUUIDPtr(id uuid.NullUUID) *openapi_types.UUID {
	if !id.Valid {
		return nil
	}
	v := openapi_types.UUID(id.UUID)
	return &v
}

func toAPITitle(t service.TitleWithAvailability) api.LibraryTitle {
	out := toAPITitleBase(t.Title)
	out.TotalCopies = t.TotalCopies
	out.AvailableCopies = t.AvailableCopies
	return out
}

// toAPITitleBase renders a title with zero copy counts; callers that have
// the counts fill them in separately (see toAPITitle).
func toAPITitleBase(t domain.Title) api.LibraryTitle {
	out := api.LibraryTitle{
		Id: t.ID, Title: t.Title, Author: t.Author, Publisher: t.Publisher, Isbn: t.ISBN,
		Classification: t.Classification, Language: t.Language, IsOpac: t.IsOPAC,
	}
	if t.ControlNumber != "" {
		out.ControlNumber = &t.ControlNumber
	}
	if t.Subtitle != "" {
		out.Subtitle = &t.Subtitle
	}
	if t.Responsibility != "" {
		out.Responsibility = &t.Responsibility
	}
	if t.AdditionalAuthors != "" {
		out.AdditionalAuthors = &t.AdditionalAuthors
	}
	if t.PublishPlace != "" {
		out.PublishPlace = &t.PublishPlace
	}
	if t.PublishYear > 0 {
		out.PublishYear = &t.PublishYear
	}
	if t.Edition != "" {
		out.Edition = &t.Edition
	}
	if t.Pages != "" {
		out.Pages = &t.Pages
	}
	if t.Illustration != "" {
		out.Illustration = &t.Illustration
	}
	if t.Dimensions != "" {
		out.Dimensions = &t.Dimensions
	}
	if t.ISSN != "" {
		out.Issn = &t.ISSN
	}
	if t.DDCNumber != "" {
		out.DdcNumber = &t.DDCNumber
	}
	if t.CallNumber != "" {
		out.CallNumber = &t.CallNumber
	}
	if t.Subjects != "" {
		out.Subjects = &t.Subjects
	}
	if t.LiteraryForm != "" {
		out.LiteraryForm = &t.LiteraryForm
	}
	if t.TargetAudience != "" {
		out.TargetAudience = &t.TargetAudience
	}
	if t.Notes != "" {
		out.Notes = &t.Notes
	}
	if t.Abstract != "" {
		out.Abstract = &t.Abstract
	}
	out.MaterialTypeId = apiUUIDPtr(t.MaterialTypeID)
	if t.CoverAssetID.Valid {
		id := openapi_types.UUID(t.CoverAssetID.UUID)
		out.CoverAssetId = &id
	}
	return out
}

func titleFromWrite(b api.LibraryTitleWrite) domain.Title {
	return domain.Title{
		ControlNumber: strOr(b.ControlNumber), Title: b.Title, Subtitle: strOr(b.Subtitle), Author: strOr(b.Author),
		Responsibility: strOr(b.Responsibility), AdditionalAuthors: strOr(b.AdditionalAuthors), Publisher: strOr(b.Publisher),
		PublishPlace: strOr(b.PublishPlace), PublishYear: intOr(b.PublishYear, 0), Edition: strOr(b.Edition), Pages: strOr(b.Pages),
		Illustration: strOr(b.Illustration), Dimensions: strOr(b.Dimensions), ISBN: strOr(b.Isbn), ISSN: strOr(b.Issn),
		DDCNumber: strOr(b.DdcNumber), CallNumber: strOr(b.CallNumber), Classification: strOr(b.Classification),
		Subjects: strOr(b.Subjects), Language: strOr(b.Language), LiteraryForm: strOr(b.LiteraryForm),
		TargetAudience: strOr(b.TargetAudience), Notes: strOr(b.Notes), Abstract: strOr(b.Abstract),
		MaterialTypeID: nullUUID(b.MaterialTypeId), IsOPAC: boolOr(b.IsOpac, true), CoverAssetID: nullUUID(b.CoverAssetId),
	}
}

func toAPICopy(c domain.Copy) api.LibraryCopy {
	out := api.LibraryCopy{
		Id: c.ID, TitleId: c.TitleID, AccessionNumber: c.AccessionNumber, Barcode: c.Barcode, CopyNumber: c.CopyNumber,
		Condition: api.LibraryCopyCondition(c.Condition), Status: api.LibraryCopyStatus(c.Status),
		Access: api.LibraryCopyAccess(c.Access), IsOpac: c.IsOPAC,
	}
	if c.CallNumber != "" {
		out.CallNumber = &c.CallNumber
	}
	out.CategoryId = apiUUIDPtr(c.CategoryID)
	out.LocationId = apiUUIDPtr(c.LocationID)
	out.SourceId = apiUUIDPtr(c.SourceID)
	out.PartnerId = apiUUIDPtr(c.PartnerID)
	if c.Price > 0 {
		out.Price = &c.Price
	}
	if c.RFID != "" {
		out.Rfid = &c.RFID
	}
	if c.AcquiredOn != nil {
		d := openapi_types.Date{Time: *c.AcquiredOn}
		out.AcquiredOn = &d
	}
	if c.Notes != "" {
		out.Notes = &c.Notes
	}
	return out
}

func copyDefaultsFromWrite(b api.LibraryCopyWrite) service.CopyDefaults {
	d := service.CopyDefaults{
		CategoryID: nullUUID(b.CategoryId), LocationID: nullUUID(b.LocationId), SourceID: nullUUID(b.SourceId),
		PartnerID: nullUUID(b.PartnerId), Price: intOr(b.Price, 0), IsOPAC: boolOr(b.IsOpac, true), Notes: strOr(b.Notes),
		CallNumber: strOr(b.CallNumber), RFID: strOr(b.Rfid), Barcode: strOr(b.Barcode), AccessionOverride: strOr(b.AccessionNumber),
	}
	if b.Access != nil {
		d.Access = domain.CopyAccess(*b.Access)
	}
	if b.Condition != nil {
		d.Condition = domain.CopyCondition(*b.Condition)
	}
	if b.Status != nil {
		d.Status = domain.CopyStatus(*b.Status)
	}
	if b.AcquiredOn != nil {
		d.AcquiredOn = &b.AcquiredOn.Time
	}
	return d
}

func toAPILoan(l domain.Loan) api.LibraryLoan {
	out := api.LibraryLoan{
		Id: l.ID, CopyId: l.CopyID, TitleId: l.TitleID, MemberUserId: l.MemberUserID,
		BorrowedAt: l.BorrowedAt, DueOn: openapi_types.Date{Time: l.DueOn}, RenewalCount: l.RenewalCount,
		Status: api.LibraryLoanStatus(l.Status), FineAmount: l.FineAmount, ReturnedAt: l.ReturnedAt, FinePaidAt: l.FinePaidAt,
	}
	return out
}

func toAPIReservation(r domain.Reservation) api.LibraryReservation {
	return api.LibraryReservation{
		Id: r.ID, TitleId: r.TitleID, MemberUserId: r.MemberUserID, Status: api.LibraryReservationStatus(r.Status),
		RequestedAt: r.RequestedAt, ReadyAt: r.ReadyAt, ExpiresAt: r.ExpiresAt,
	}
}

func toAPIQueuedReservation(r service.QueuedReservation) api.LibraryReservation {
	out := toAPIReservation(r.Reservation)
	if r.Position > 0 {
		pos := r.Position
		out.Position = &pos
	}
	return out
}

func toAPIStocktake(s domain.Stocktake) api.LibraryStocktake {
	out := api.LibraryStocktake{
		Id: s.ID, Name: s.Name, StartedOn: openapi_types.Date{Time: s.StartedOn}, CoordinatorUserId: s.CoordinatorUserID,
		Status: api.LibraryStocktakeStatus(s.Status), MissingCount: s.MissingCount, UnexpectedCount: s.UnexpectedCount,
		MisplacedCount: s.MisplacedCount,
	}
	if s.EndedOn != nil {
		d := openapi_types.Date{Time: *s.EndedOn}
		out.EndedOn = &d
	}
	if s.Notes != "" {
		out.Notes = &s.Notes
	}
	if s.MarkMissingAs != "" {
		m := api.LibraryMarkMissingAs(s.MarkMissingAs)
		out.MarkMissingAs = &m
	}
	return out
}

func toAPIScan(s domain.StocktakeScan) api.LibraryStocktakeScan {
	out := api.LibraryStocktakeScan{
		Id: s.ID, StocktakeId: s.StocktakeID, RawCode: s.RawCode, Outcome: api.LibraryStocktakeScanOutcome(s.Outcome),
		ScannedAt: s.ScannedAt,
	}
	out.CopyId = apiUUIDPtr(s.CopyID)
	out.LocationId = apiUUIDPtr(s.LocationID)
	return out
}

func toAPIStocktakeResult(r domain.StocktakeResult) api.LibraryStocktakeResult {
	missing := make([]api.LibraryCopy, len(r.Missing))
	for i, c := range r.Missing {
		missing[i] = toAPICopy(c)
	}
	unexpected := make([]api.LibraryCopy, len(r.Unexpected))
	for i, c := range r.Unexpected {
		unexpected[i] = toAPICopy(c)
	}
	misplaced := make([]api.LibraryStocktakeMisplacedCopy, len(r.Misplaced))
	for i, m := range r.Misplaced {
		misplaced[i] = api.LibraryStocktakeMisplacedCopy{Copy: toAPICopy(m.Copy), FoundLocationId: m.FoundLocationID}
	}
	return api.LibraryStocktakeResult{
		ExpectedCount: r.ExpectedCount, ScannedCount: r.ScannedCount, Missing: missing, Unexpected: unexpected, Misplaced: misplaced,
	}
}

func toAPIPolicy(p domain.Policy) api.LibraryPolicy {
	return api.LibraryPolicy{
		Version: p.Version, LoanDays: p.LoanDays, MaxActiveLoans: p.MaxActiveLoans, MaxRenewals: p.MaxRenewals,
		RenewalDays: p.RenewalDays, FinePerDay: p.FinePerDay, ReservationHoldDays: p.ReservationHoldDays,
	}
}

func toAPIMasterEntry(e domain.MasterEntry) api.LibraryMasterEntry {
	return api.LibraryMasterEntry{Id: e.ID, Code: e.Code, Name: e.Name, IsActive: e.IsActive, SortOrder: e.SortOrder}
}

func toAPIMaterialType(e domain.MasterEntry) api.LibraryMaterialType {
	return api.LibraryMaterialType{
		Id: e.ID, Code: e.Code, Name: e.Name, IsActive: e.IsActive, SortOrder: e.SortOrder,
		MaxLoanItems: e.MaxLoanItems, MaxLoanDays: e.MaxLoanDays, MaxRenewals: e.MaxRenewals,
	}
}

func toAPIPartner(e domain.MasterEntry) api.LibraryPartner {
	out := api.LibraryPartner{Id: e.ID, Code: e.Code, Name: e.Name, IsActive: e.IsActive, SortOrder: e.SortOrder}
	if e.ContactName != "" {
		out.ContactName = &e.ContactName
	}
	if e.Phone != "" {
		out.Phone = &e.Phone
	}
	if e.Address != "" {
		out.Address = &e.Address
	}
	return out
}

func toAPIDDCClass(c domain.DDCClass) api.LibraryDDCClass {
	return api.LibraryDDCClass{Code: c.Code, Name: c.Name}
}

func toAPIItemEvent(e domain.ItemEvent) api.LibraryItemEvent {
	out := api.LibraryItemEvent{Id: e.ID, CopyId: e.CopyID, EventType: api.LibraryItemEventType(e.EventType), CreatedAt: e.CreatedAt}
	if e.FromStatus != "" {
		out.FromStatus = &e.FromStatus
	}
	if e.ToStatus != "" {
		out.ToStatus = &e.ToStatus
	}
	if e.Note != "" {
		out.Note = &e.Note
	}
	if e.ActorUserID.Valid {
		id := openapi_types.UUID(e.ActorUserID.UUID)
		out.ActorUserId = &id
	}
	return out
}
