package http

import (
	"context"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
)

func (h *LibraryHandler) GetMyLibraryProfile(ctx context.Context, _ api.GetMyLibraryProfileRequestObject) (api.GetMyLibraryProfileResponseObject, error) {
	profile, err := h.service.MyProfile(ctx, tenantID(ctx), userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	out := api.LibraryMyProfile{
		ActiveLoans: make([]api.LibraryLoan, len(profile.ActiveLoans)), History: make([]api.LibraryLoan, len(profile.History)),
		Reservations: make([]api.LibraryReservation, len(profile.Reservations)), Violations: make([]api.LibraryViolation, len(profile.Violations)),
		BookingEnabled: &profile.BookingEnabled,
	}
	for i, l := range profile.ActiveLoans {
		out.ActiveLoans[i] = toAPILoan(l)
	}
	for i, l := range profile.History {
		out.History[i] = toAPILoan(l)
	}
	for i, r := range profile.Reservations {
		out.Reservations[i] = toAPIReservation(r)
	}
	for i, v := range profile.Violations {
		out.Violations[i] = toAPIViolation(v)
	}
	if profile.Member != nil {
		m := toAPIMember(*profile.Member)
		out.Member = &m
	}
	return api.GetMyLibraryProfile200JSONResponse(out), nil
}

func (h *LibraryHandler) RenewMyLibraryLoan(ctx context.Context, request api.RenewMyLibraryLoanRequestObject) (api.RenewMyLibraryLoanResponseObject, error) {
	loan, err := h.service.RenewMyLoan(ctx, tenantID(ctx), request.LoanId, userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.RenewMyLibraryLoan200JSONResponse(toAPILoan(loan)), nil
}

func (h *LibraryHandler) ReserveMyLibraryTitle(ctx context.Context, request api.ReserveMyLibraryTitleRequestObject) (api.ReserveMyLibraryTitleResponseObject, error) {
	r, err := h.service.ReserveForSelf(ctx, tenantID(ctx), request.Body.TitleId, userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.ReserveMyLibraryTitle201JSONResponse(toAPIReservation(r)), nil
}

func (h *LibraryHandler) CancelMyLibraryReservation(ctx context.Context, request api.CancelMyLibraryReservationRequestObject) (api.CancelMyLibraryReservationResponseObject, error) {
	r, err := h.service.CancelMyReservation(ctx, tenantID(ctx), request.ReservationId, userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.CancelMyLibraryReservation200JSONResponse(toAPIReservation(r)), nil
}
