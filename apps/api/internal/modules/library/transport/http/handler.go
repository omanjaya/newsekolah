// Package http adapts the generated strict-server interface to the
// library service.
package http

import (
	"context"
	"errors"
	"time"

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
	domain.ErrCopyNotFound:           httpx.ErrLibraryCopyNotFound,
	domain.ErrCopyBarcodeExists:      httpx.ErrLibraryCopyBarcodeExists,
	domain.ErrCopyNotAvailable:       httpx.ErrLibraryCopyNotAvailable,
	domain.ErrCopyOnLoan:             httpx.ErrLibraryCopyOnLoan,
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
	domain.ErrInvalidInput:           httpx.ErrValidation,

	domain.ErrModuleDisabled: httpx.ErrLibraryModuleDisabled,
	domain.ErrLoansClosed:    httpx.ErrLibraryLoansClosed,
	domain.ErrUnpaidFine:     httpx.ErrLibraryUnpaidFine,
	domain.ErrForbidden:      httpx.ErrLibraryForbidden,

	domain.ErrMemberNotFound:      httpx.ErrLibraryMemberNotFound,
	domain.ErrMemberAlreadyExists: httpx.ErrLibraryMemberAlreadyExists,
	domain.ErrMemberNotActive:     httpx.ErrLibraryMemberNotActive,
	domain.ErrMemberSuspended:     httpx.ErrLibraryMemberSuspended,
	domain.ErrMemberExpired:       httpx.ErrLibraryMemberExpired,
	domain.ErrMemberNotClearable:  httpx.ErrLibraryMemberNotClearable,
	domain.ErrMemberTypeNotFound:  httpx.ErrLibraryMemberTypeNotFound,
	domain.ErrMemberTypeInUse:     httpx.ErrLibraryMemberTypeInUse,
	domain.ErrMemberNoExhausted:   httpx.ErrLibraryMemberNoExhausted,
	domain.ErrMemberNoCollision:   httpx.ErrLibraryMemberNoCollision,

	domain.ErrViolationNotFound:       httpx.ErrLibraryViolationNotFound,
	domain.ErrViolationAlreadySettled: httpx.ErrLibraryViolationAlreadySettled,

	domain.ErrVisitNotFound: httpx.ErrLibraryVisitNotFound,
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

func boolOr(p *bool) bool {
	if p == nil {
		return false
	}
	return *p
}

func barcodeSourceOr(p *api.LibraryPolicyWriteBarcodeSource, def string) string {
	if p == nil || string(*p) == "" {
		return def
	}
	return string(*p)
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
		Classification: t.Classification, Language: t.Language,
	}
	if t.Subtitle != "" {
		out.Subtitle = &t.Subtitle
	}
	if t.PublishYear > 0 {
		out.PublishYear = &t.PublishYear
	}
	if t.CoverAssetID.Valid {
		id := openapi_types.UUID(t.CoverAssetID.UUID)
		out.CoverAssetId = &id
	}
	return out
}

func toAPICopy(c domain.Copy) api.LibraryCopy {
	out := api.LibraryCopy{
		Id: c.ID, TitleId: c.TitleID, Barcode: c.Barcode,
		Condition: api.LibraryCopyCondition(c.Condition), Status: api.LibraryCopyStatus(c.Status),
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

func openapiDate(t time.Time) openapi_types.Date { return openapi_types.Date{Time: t} }

func toAPILoan(l domain.Loan) api.LibraryLoan {
	channel := api.LibraryLoanChannel(l.Channel)
	out := api.LibraryLoan{
		Id: l.ID, CopyId: l.CopyID, TitleId: l.TitleID, MemberUserId: l.MemberUserID,
		BorrowedAt: l.BorrowedAt, DueOn: openapiDate(l.DueOn), RenewalCount: l.RenewalCount,
		Status: api.LibraryLoanStatus(l.Status), FineAmount: l.FineAmount, ReturnedAt: l.ReturnedAt, FinePaidAt: l.FinePaidAt,
		Channel: &channel,
	}
	return out
}

func toAPIReservation(r domain.Reservation) api.LibraryReservation {
	out := api.LibraryReservation{
		Id: r.ID, TitleId: r.TitleID, MemberUserId: r.MemberUserID, Status: api.LibraryReservationStatus(r.Status),
		RequestedAt: r.RequestedAt, ReadyAt: r.ReadyAt, ExpiresAt: r.ExpiresAt,
	}
	if r.HeldCopyID.Valid {
		id := openapi_types.UUID(r.HeldCopyID.UUID)
		out.HeldCopyId = &id
	}
	return out
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
		Status: api.LibraryStocktakeStatus(s.Status),
	}
	if s.EndedOn != nil {
		d := openapi_types.Date{Time: *s.EndedOn}
		out.EndedOn = &d
	}
	if s.Notes != "" {
		out.Notes = &s.Notes
	}
	return out
}

func toAPIScan(s domain.StocktakeScan) api.LibraryStocktakeScan {
	return api.LibraryStocktakeScan{Id: s.ID, StocktakeId: s.StocktakeID, CopyId: s.CopyID, Barcode: s.Barcode, ScannedAt: s.ScannedAt}
}

func toAPIStocktakeResult(r domain.StocktakeResult) api.LibraryStocktakeResult {
	missing := make([]api.LibraryCopy, len(r.Missing))
	for i, c := range r.Missing {
		missing[i] = toAPICopy(c)
	}
	unexpected := r.Unexpected
	if unexpected == nil {
		unexpected = []string{}
	}
	return api.LibraryStocktakeResult{ExpectedCount: r.ExpectedCount, ScannedCount: r.ScannedCount, Missing: missing, Unexpected: unexpected}
}

func toAPIPolicy(p domain.Policy) api.LibraryPolicy {
	barcodeSource := api.LibraryPolicyBarcodeSource(p.BarcodeSource)
	return api.LibraryPolicy{
		Version: p.Version, LoanDays: p.LoanDays, MaxActiveLoans: p.MaxActiveLoans, MaxRenewals: p.MaxRenewals,
		RenewalDays: p.RenewalDays, FinePerDay: p.FinePerDay, ReservationHoldDays: p.ReservationHoldDays,
		Name: p.Name, Npp: &p.NPP, BarcodeSource: &barcodeSource, AccessionFormat: &p.AccessionFormat,
		MemberNoFormat: &p.MemberNoFormat, SaturdayClosed: p.SaturdayClosed, SundayClosed: p.SundayClosed,
		BookingEnabled: p.BookingEnabled, BookingMax: p.BookingMax, FineCurrencyEnabled: p.FineCurrencyEnabled,
		BlockLoansWithUnpaidFines: p.BlockLoansWithUnpaidFines, DueReminderDays: p.DueReminderDays,
		AutoRegisterMembers: p.AutoRegisterMembers,
	}
}
