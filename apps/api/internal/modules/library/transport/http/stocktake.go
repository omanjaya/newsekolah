package http

import (
	"context"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
)

func (h *LibraryHandler) ListLibraryStocktakes(ctx context.Context, request api.ListLibraryStocktakesRequestObject) (api.ListLibraryStocktakesResponseObject, error) {
	sessions, err := h.service.ListStocktakes(ctx, tenantID(ctx), intOr(request.Params.Limit, 20), intOr(request.Params.Offset, 0))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LibraryStocktake, len(sessions))
	for i, s := range sessions {
		data[i] = toAPIStocktake(s)
	}
	return api.ListLibraryStocktakes200JSONResponse{Data: data}, nil
}

func (h *LibraryHandler) StartLibraryStocktake(ctx context.Context, request api.StartLibraryStocktakeRequestObject) (api.StartLibraryStocktakeResponseObject, error) {
	b := request.Body
	st, err := h.service.StartStocktake(ctx, tenantID(ctx), b.Name, userID(ctx), strOr(b.Notes))
	if err != nil {
		return nil, mapError(err)
	}
	return api.StartLibraryStocktake201JSONResponse(toAPIStocktake(st)), nil
}

func (h *LibraryHandler) GetLibraryStocktake(ctx context.Context, request api.GetLibraryStocktakeRequestObject) (api.GetLibraryStocktakeResponseObject, error) {
	st, err := h.service.GetStocktake(ctx, tenantID(ctx), request.StocktakeId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetLibraryStocktake200JSONResponse(toAPIStocktake(st)), nil
}

func (h *LibraryHandler) ScanLibraryStocktake(ctx context.Context, request api.ScanLibraryStocktakeRequestObject) (api.ScanLibraryStocktakeResponseObject, error) {
	scan, err := h.service.ScanBarcode(ctx, tenantID(ctx), request.StocktakeId, request.Body.Barcode, userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.ScanLibraryStocktake201JSONResponse(toAPIScan(scan)), nil
}

func (h *LibraryHandler) CloseLibraryStocktake(ctx context.Context, request api.CloseLibraryStocktakeRequestObject) (api.CloseLibraryStocktakeResponseObject, error) {
	var notes string
	if request.Body != nil {
		notes = strOr(request.Body.Notes)
	}
	result, err := h.service.Close(ctx, tenantID(ctx), request.StocktakeId, notes)
	if err != nil {
		return nil, mapError(err)
	}
	return api.CloseLibraryStocktake200JSONResponse(toAPIStocktakeResult(result)), nil
}
