package http

import (
	"context"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
)

func (h *LibraryHandler) CreateLibraryReservation(ctx context.Context, request api.CreateLibraryReservationRequestObject) (api.CreateLibraryReservationResponseObject, error) {
	b := request.Body
	reservation, err := h.service.Reserve(ctx, tenantID(ctx), b.TitleId, b.MemberUserId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.CreateLibraryReservation201JSONResponse(toAPIReservation(reservation)), nil
}

func (h *LibraryHandler) CancelLibraryReservation(ctx context.Context, request api.CancelLibraryReservationRequestObject) (api.CancelLibraryReservationResponseObject, error) {
	reservation, err := h.service.CancelReservation(ctx, tenantID(ctx), request.ReservationId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.CancelLibraryReservation200JSONResponse(toAPIReservation(reservation)), nil
}

func (h *LibraryHandler) ListTitleReservationQueue(ctx context.Context, request api.ListTitleReservationQueueRequestObject) (api.ListTitleReservationQueueResponseObject, error) {
	queue, err := h.service.ReservationQueue(ctx, tenantID(ctx), request.TitleId)
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LibraryReservation, len(queue))
	for i, r := range queue {
		data[i] = toAPIQueuedReservation(r)
	}
	return api.ListTitleReservationQueue200JSONResponse{Data: data}, nil
}

func (h *LibraryHandler) ListMemberReservations(ctx context.Context, request api.ListMemberReservationsRequestObject) (api.ListMemberReservationsResponseObject, error) {
	reservations, err := h.service.MemberReservations(ctx, tenantID(ctx), request.UserId)
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LibraryReservation, len(reservations))
	for i, r := range reservations {
		data[i] = toAPIReservation(r)
	}
	return api.ListMemberReservations200JSONResponse{Data: data}, nil
}
