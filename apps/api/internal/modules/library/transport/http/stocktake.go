package http

import (
	"bytes"
	"context"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
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
	b := request.Body
	scans, err := h.service.ScanCodes(ctx, tenantID(ctx), request.StocktakeId, b.Codes, nullUUID(b.LocationId), userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LibraryStocktakeScan, len(scans))
	for i, s := range scans {
		data[i] = toAPIScan(s)
	}
	return api.ScanLibraryStocktake201JSONResponse{Data: data}, nil
}

func (h *LibraryHandler) GetLibraryStocktakeProgress(ctx context.Context, request api.GetLibraryStocktakeProgressRequestObject) (api.GetLibraryStocktakeProgressResponseObject, error) {
	p, err := h.service.StocktakeProgress(ctx, tenantID(ctx), request.StocktakeId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetLibraryStocktakeProgress200JSONResponse{
		ExpectedCount: p.ExpectedCount, ScannedCount: p.ScannedCount, MissingCount: p.MissingCount, MisplacedCount: p.MisplacedCount,
	}, nil
}

func (h *LibraryHandler) GetLibraryStocktakeResults(ctx context.Context, request api.GetLibraryStocktakeResultsRequestObject) (api.GetLibraryStocktakeResultsResponseObject, error) {
	result, err := h.service.StocktakeResults(ctx, tenantID(ctx), request.StocktakeId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetLibraryStocktakeResults200JSONResponse(toAPIStocktakeResult(result)), nil
}

func (h *LibraryHandler) GetLibraryStocktakeReportXlsx(ctx context.Context, request api.GetLibraryStocktakeReportXlsxRequestObject) (api.GetLibraryStocktakeReportXlsxResponseObject, error) {
	xlsx, err := h.service.StocktakeReportXLSX(ctx, tenantID(ctx), request.StocktakeId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetLibraryStocktakeReportXlsx200ApplicationvndOpenxmlformatsOfficedocumentSpreadsheetmlSheetResponse{
		Body: bytes.NewReader(xlsx), ContentLength: int64(len(xlsx)),
	}, nil
}

func (h *LibraryHandler) CloseLibraryStocktake(ctx context.Context, request api.CloseLibraryStocktakeRequestObject) (api.CloseLibraryStocktakeResponseObject, error) {
	var notes string
	markMissingAs := domain.MarkMissingAsNone
	if request.Body != nil {
		notes = strOr(request.Body.Notes)
		if request.Body.MarkMissingAs != nil {
			markMissingAs = domain.MarkMissingAs(*request.Body.MarkMissingAs)
		}
	}
	result, err := h.service.Close(ctx, tenantID(ctx), request.StocktakeId, notes, markMissingAs, userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.CloseLibraryStocktake200JSONResponse(toAPIStocktakeResult(result)), nil
}
