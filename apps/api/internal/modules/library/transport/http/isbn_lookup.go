package http

import (
	"context"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
)

func (h *LibraryHandler) LookupExternalIsbn(ctx context.Context, request api.LookupExternalIsbnRequestObject) (api.LookupExternalIsbnResponseObject, error) {
	result, err := h.service.LookupISBN(ctx, tenantID(ctx), request.Params.Isbn)
	if err != nil {
		return nil, mapError(err)
	}
	return api.LookupExternalIsbn200JSONResponse(toAPIIsbnLookupResult(result)), nil
}

func (h *LibraryHandler) DownloadLibraryCover(ctx context.Context, request api.DownloadLibraryCoverRequestObject) (api.DownloadLibraryCoverResponseObject, error) {
	if request.Body == nil {
		return nil, mapError(domain.ErrInvalidInput)
	}
	assetID, err := h.service.DownloadCoverFromURL(ctx, tenantID(ctx), userID(ctx), request.Body.Url)
	if err != nil {
		return nil, mapError(err)
	}
	return api.DownloadLibraryCover201JSONResponse{AssetId: assetID}, nil
}

func toAPIIsbnLookupResult(r service.ISBNLookupResult) api.LibraryIsbnLookupResult {
	out := api.LibraryIsbnLookupResult{Found: r.Found}
	if r.Source != "" {
		source := api.LibraryIsbnLookupResultSource(r.Source)
		out.Source = &source
	}
	if r.Found {
		bib := api.LibraryExternalBibliography{
			Title: r.Bibliography.Title, Subtitle: r.Bibliography.Subtitle, MainAuthor: r.Bibliography.MainAuthor,
			AdditionalAuthors: r.Bibliography.AdditionalAuthors, Publisher: r.Bibliography.Publisher,
			PublishPlace: r.Bibliography.PublishPlace, Pages: r.Bibliography.Pages,
			Isbn: r.Bibliography.ISBN, Subjects: r.Bibliography.Subjects, Language: r.Bibliography.Language,
			Abstract: r.Bibliography.Abstract, CoverImageUrl: r.Bibliography.CoverImageURL,
		}
		if r.Bibliography.PublishYear > 0 {
			year := r.Bibliography.PublishYear
			bib.PublishYear = &year
		}
		out.Bibliography = &bib
	}
	if r.LocalTitleID.Valid {
		id := r.LocalTitleID.UUID
		out.LocalTitleId = &id
	}
	return out
}
