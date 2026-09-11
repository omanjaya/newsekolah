package http

import (
	"context"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
)

func (h *LibraryHandler) GetOpacTitleDetail(ctx context.Context, request api.GetOpacTitleDetailRequestObject) (api.GetOpacTitleDetailResponseObject, error) {
	detail, err := h.service.OpacTitleDetail(ctx, tenantID(ctx), request.TitleId)
	if err != nil {
		return nil, mapError(err)
	}
	copies := make([]api.LibraryOpacCopy, len(detail.Copies))
	for i, c := range detail.Copies {
		access := api.LibraryCopyAccess(c.Access)
		copies[i] = api.LibraryOpacCopy{
			Barcode: c.Barcode, CallNumber: c.CallNumber, LocationId: apiUUIDPtr(c.LocationID),
			Access: &access, Status: api.LibraryCopyStatus(c.Status),
		}
	}
	return api.GetOpacTitleDetail200JSONResponse{Title: toAPITitle(detail.TitleWithAvailability), Copies: copies}, nil
}

func (h *LibraryHandler) GetOpacHighlights(ctx context.Context, _ api.GetOpacHighlightsRequestObject) (api.GetOpacHighlightsResponseObject, error) {
	highlights, err := h.service.OpacHighlights(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	name, err := h.service.LibraryName(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	newest := make([]api.LibraryTitle, len(highlights.Newest))
	for i, t := range highlights.Newest {
		newest[i] = toAPITitle(t)
	}
	mostBorrowed := make([]api.LibraryTitle, len(highlights.MostBorrowed))
	for i, t := range highlights.MostBorrowed {
		mostBorrowed[i] = toAPITitle(t)
	}
	return api.GetOpacHighlights200JSONResponse{Newest: newest, MostBorrowed: mostBorrowed, LibraryName: name}, nil
}
