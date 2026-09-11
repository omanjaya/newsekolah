package http

import (
	"context"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
)

func masterEntryFromWrite(b api.LibraryMasterEntryWrite) domain.MasterEntry {
	return domain.MasterEntry{Code: b.Code, Name: b.Name, IsActive: boolOr(b.IsActive, true), SortOrder: intOr(b.SortOrder, 0)}
}

// Material types.

func (h *LibraryHandler) ListLibraryMaterialTypes(ctx context.Context, _ api.ListLibraryMaterialTypesRequestObject) (api.ListLibraryMaterialTypesResponseObject, error) {
	entries, err := h.service.ListMaterialTypes(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LibraryMaterialType, len(entries))
	for i, e := range entries {
		data[i] = toAPIMaterialType(e)
	}
	return api.ListLibraryMaterialTypes200JSONResponse{Data: data}, nil
}

func (h *LibraryHandler) CreateLibraryMaterialType(ctx context.Context, request api.CreateLibraryMaterialTypeRequestObject) (api.CreateLibraryMaterialTypeResponseObject, error) {
	b := request.Body
	e, err := h.service.CreateMaterialType(ctx, domain.MasterEntry{
		TenantID: tenantID(ctx), Code: b.Code, Name: b.Name, IsActive: boolOr(b.IsActive, true), SortOrder: intOr(b.SortOrder, 0),
		MaxLoanItems: b.MaxLoanItems, MaxLoanDays: b.MaxLoanDays, MaxRenewals: b.MaxRenewals,
	})
	if err != nil {
		return nil, mapError(err)
	}
	return api.CreateLibraryMaterialType201JSONResponse(toAPIMaterialType(e)), nil
}

func (h *LibraryHandler) UpdateLibraryMaterialType(ctx context.Context, request api.UpdateLibraryMaterialTypeRequestObject) (api.UpdateLibraryMaterialTypeResponseObject, error) {
	b := request.Body
	e, err := h.service.UpdateMaterialType(ctx, domain.MasterEntry{
		TenantID: tenantID(ctx), ID: request.Id, Code: b.Code, Name: b.Name, IsActive: boolOr(b.IsActive, true), SortOrder: intOr(b.SortOrder, 0),
		MaxLoanItems: b.MaxLoanItems, MaxLoanDays: b.MaxLoanDays, MaxRenewals: b.MaxRenewals,
	})
	if err != nil {
		return nil, mapError(err)
	}
	return api.UpdateLibraryMaterialType200JSONResponse(toAPIMaterialType(e)), nil
}

func (h *LibraryHandler) DeleteLibraryMaterialType(ctx context.Context, request api.DeleteLibraryMaterialTypeRequestObject) (api.DeleteLibraryMaterialTypeResponseObject, error) {
	if err := h.service.DeleteMaterialType(ctx, tenantID(ctx), request.Id); err != nil {
		return nil, mapError(err)
	}
	return api.DeleteLibraryMaterialType204Response{}, nil
}

// Collection categories.

func (h *LibraryHandler) ListLibraryCollectionCategories(ctx context.Context, _ api.ListLibraryCollectionCategoriesRequestObject) (api.ListLibraryCollectionCategoriesResponseObject, error) {
	entries, err := h.service.ListCollectionCategories(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LibraryMasterEntry, len(entries))
	for i, e := range entries {
		data[i] = toAPIMasterEntry(e)
	}
	return api.ListLibraryCollectionCategories200JSONResponse{Data: data}, nil
}

func (h *LibraryHandler) CreateLibraryCollectionCategory(ctx context.Context, request api.CreateLibraryCollectionCategoryRequestObject) (api.CreateLibraryCollectionCategoryResponseObject, error) {
	e := masterEntryFromWrite(*request.Body)
	e.TenantID = tenantID(ctx)
	created, err := h.service.CreateCollectionCategory(ctx, e)
	if err != nil {
		return nil, mapError(err)
	}
	return api.CreateLibraryCollectionCategory201JSONResponse(toAPIMasterEntry(created)), nil
}

func (h *LibraryHandler) UpdateLibraryCollectionCategory(ctx context.Context, request api.UpdateLibraryCollectionCategoryRequestObject) (api.UpdateLibraryCollectionCategoryResponseObject, error) {
	e := masterEntryFromWrite(*request.Body)
	e.TenantID = tenantID(ctx)
	e.ID = request.Id
	updated, err := h.service.UpdateCollectionCategory(ctx, e)
	if err != nil {
		return nil, mapError(err)
	}
	return api.UpdateLibraryCollectionCategory200JSONResponse(toAPIMasterEntry(updated)), nil
}

func (h *LibraryHandler) DeleteLibraryCollectionCategory(ctx context.Context, request api.DeleteLibraryCollectionCategoryRequestObject) (api.DeleteLibraryCollectionCategoryResponseObject, error) {
	if err := h.service.DeleteCollectionCategory(ctx, tenantID(ctx), request.Id); err != nil {
		return nil, mapError(err)
	}
	return api.DeleteLibraryCollectionCategory204Response{}, nil
}

// Acquisition sources.

func (h *LibraryHandler) ListLibraryAcquisitionSources(ctx context.Context, _ api.ListLibraryAcquisitionSourcesRequestObject) (api.ListLibraryAcquisitionSourcesResponseObject, error) {
	entries, err := h.service.ListAcquisitionSources(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LibraryMasterEntry, len(entries))
	for i, e := range entries {
		data[i] = toAPIMasterEntry(e)
	}
	return api.ListLibraryAcquisitionSources200JSONResponse{Data: data}, nil
}

func (h *LibraryHandler) CreateLibraryAcquisitionSource(ctx context.Context, request api.CreateLibraryAcquisitionSourceRequestObject) (api.CreateLibraryAcquisitionSourceResponseObject, error) {
	e := masterEntryFromWrite(*request.Body)
	e.TenantID = tenantID(ctx)
	created, err := h.service.CreateAcquisitionSource(ctx, e)
	if err != nil {
		return nil, mapError(err)
	}
	return api.CreateLibraryAcquisitionSource201JSONResponse(toAPIMasterEntry(created)), nil
}

func (h *LibraryHandler) UpdateLibraryAcquisitionSource(ctx context.Context, request api.UpdateLibraryAcquisitionSourceRequestObject) (api.UpdateLibraryAcquisitionSourceResponseObject, error) {
	e := masterEntryFromWrite(*request.Body)
	e.TenantID = tenantID(ctx)
	e.ID = request.Id
	updated, err := h.service.UpdateAcquisitionSource(ctx, e)
	if err != nil {
		return nil, mapError(err)
	}
	return api.UpdateLibraryAcquisitionSource200JSONResponse(toAPIMasterEntry(updated)), nil
}

func (h *LibraryHandler) DeleteLibraryAcquisitionSource(ctx context.Context, request api.DeleteLibraryAcquisitionSourceRequestObject) (api.DeleteLibraryAcquisitionSourceResponseObject, error) {
	if err := h.service.DeleteAcquisitionSource(ctx, tenantID(ctx), request.Id); err != nil {
		return nil, mapError(err)
	}
	return api.DeleteLibraryAcquisitionSource204Response{}, nil
}

// Partners.

func (h *LibraryHandler) ListLibraryPartners(ctx context.Context, _ api.ListLibraryPartnersRequestObject) (api.ListLibraryPartnersResponseObject, error) {
	entries, err := h.service.ListPartners(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LibraryPartner, len(entries))
	for i, e := range entries {
		data[i] = toAPIPartner(e)
	}
	return api.ListLibraryPartners200JSONResponse{Data: data}, nil
}

func (h *LibraryHandler) CreateLibraryPartner(ctx context.Context, request api.CreateLibraryPartnerRequestObject) (api.CreateLibraryPartnerResponseObject, error) {
	b := request.Body
	e, err := h.service.CreatePartner(ctx, domain.MasterEntry{
		TenantID: tenantID(ctx), Code: b.Code, Name: b.Name, IsActive: boolOr(b.IsActive, true), SortOrder: intOr(b.SortOrder, 0),
		ContactName: strOr(b.ContactName), Phone: strOr(b.Phone), Address: strOr(b.Address),
	})
	if err != nil {
		return nil, mapError(err)
	}
	return api.CreateLibraryPartner201JSONResponse(toAPIPartner(e)), nil
}

func (h *LibraryHandler) UpdateLibraryPartner(ctx context.Context, request api.UpdateLibraryPartnerRequestObject) (api.UpdateLibraryPartnerResponseObject, error) {
	b := request.Body
	e, err := h.service.UpdatePartner(ctx, domain.MasterEntry{
		TenantID: tenantID(ctx), ID: request.Id, Code: b.Code, Name: b.Name, IsActive: boolOr(b.IsActive, true), SortOrder: intOr(b.SortOrder, 0),
		ContactName: strOr(b.ContactName), Phone: strOr(b.Phone), Address: strOr(b.Address),
	})
	if err != nil {
		return nil, mapError(err)
	}
	return api.UpdateLibraryPartner200JSONResponse(toAPIPartner(e)), nil
}

func (h *LibraryHandler) DeleteLibraryPartner(ctx context.Context, request api.DeleteLibraryPartnerRequestObject) (api.DeleteLibraryPartnerResponseObject, error) {
	if err := h.service.DeletePartner(ctx, tenantID(ctx), request.Id); err != nil {
		return nil, mapError(err)
	}
	return api.DeleteLibraryPartner204Response{}, nil
}

// Locations.

func (h *LibraryHandler) ListLibraryLocations(ctx context.Context, _ api.ListLibraryLocationsRequestObject) (api.ListLibraryLocationsResponseObject, error) {
	entries, err := h.service.ListLocations(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LibraryMasterEntry, len(entries))
	for i, e := range entries {
		data[i] = toAPIMasterEntry(e)
	}
	return api.ListLibraryLocations200JSONResponse{Data: data}, nil
}

func (h *LibraryHandler) CreateLibraryLocation(ctx context.Context, request api.CreateLibraryLocationRequestObject) (api.CreateLibraryLocationResponseObject, error) {
	e := masterEntryFromWrite(*request.Body)
	e.TenantID = tenantID(ctx)
	created, err := h.service.CreateLocation(ctx, e)
	if err != nil {
		return nil, mapError(err)
	}
	return api.CreateLibraryLocation201JSONResponse(toAPIMasterEntry(created)), nil
}

func (h *LibraryHandler) UpdateLibraryLocation(ctx context.Context, request api.UpdateLibraryLocationRequestObject) (api.UpdateLibraryLocationResponseObject, error) {
	e := masterEntryFromWrite(*request.Body)
	e.TenantID = tenantID(ctx)
	e.ID = request.Id
	updated, err := h.service.UpdateLocation(ctx, e)
	if err != nil {
		return nil, mapError(err)
	}
	return api.UpdateLibraryLocation200JSONResponse(toAPIMasterEntry(updated)), nil
}

func (h *LibraryHandler) DeleteLibraryLocation(ctx context.Context, request api.DeleteLibraryLocationRequestObject) (api.DeleteLibraryLocationResponseObject, error) {
	if err := h.service.DeleteLocation(ctx, tenantID(ctx), request.Id); err != nil {
		return nil, mapError(err)
	}
	return api.DeleteLibraryLocation204Response{}, nil
}

// DDC classes and combined options.

func (h *LibraryHandler) ListLibraryDdcClasses(ctx context.Context, _ api.ListLibraryDdcClassesRequestObject) (api.ListLibraryDdcClassesResponseObject, error) {
	classes, err := h.service.ListDDCClasses(ctx)
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.LibraryDDCClass, len(classes))
	for i, c := range classes {
		data[i] = toAPIDDCClass(c)
	}
	return api.ListLibraryDdcClasses200JSONResponse{Data: data}, nil
}

func (h *LibraryHandler) GetLibraryCatalogueOptions(ctx context.Context, _ api.GetLibraryCatalogueOptionsRequestObject) (api.GetLibraryCatalogueOptionsResponseObject, error) {
	opts, err := h.service.CatalogueOptions(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	materialTypes := make([]api.LibraryMaterialType, len(opts.MaterialTypes))
	for i, e := range opts.MaterialTypes {
		materialTypes[i] = toAPIMaterialType(e)
	}
	categories := make([]api.LibraryMasterEntry, len(opts.CollectionCategories))
	for i, e := range opts.CollectionCategories {
		categories[i] = toAPIMasterEntry(e)
	}
	sources := make([]api.LibraryMasterEntry, len(opts.AcquisitionSources))
	for i, e := range opts.AcquisitionSources {
		sources[i] = toAPIMasterEntry(e)
	}
	partners := make([]api.LibraryPartner, len(opts.Partners))
	for i, e := range opts.Partners {
		partners[i] = toAPIPartner(e)
	}
	locations := make([]api.LibraryMasterEntry, len(opts.Locations))
	for i, e := range opts.Locations {
		locations[i] = toAPIMasterEntry(e)
	}
	ddc := make([]api.LibraryDDCClass, len(opts.DDCClasses))
	for i, c := range opts.DDCClasses {
		ddc[i] = toAPIDDCClass(c)
	}
	return api.GetLibraryCatalogueOptions200JSONResponse{
		MaterialTypes: materialTypes, CollectionCategories: categories, AcquisitionSources: sources,
		Partners: partners, Locations: locations, DdcClasses: ddc,
	}, nil
}
