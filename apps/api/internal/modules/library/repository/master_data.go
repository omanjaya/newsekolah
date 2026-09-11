package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
)

// Material types.

func (r *Repository) CreateMaterialType(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error) {
	row, err := r.queries(ctx).CreateMaterialType(ctx, db.CreateMaterialTypeParams{
		TenantID: e.TenantID, Code: e.Code, Name: e.Name, MaxLoanItems: int32(e.MaxLoanItems), //nolint:gosec // validated
		MaxLoanDays: int32(e.MaxLoanDays), MaxRenewals: int32(e.MaxRenewals), IsActive: e.IsActive, SortOrder: int32(e.SortOrder), //nolint:gosec // validated
	})
	if isUnique(err) {
		return domain.MasterEntry{}, domain.ErrMasterDataCodeExists
	}
	if err != nil {
		return domain.MasterEntry{}, fmt.Errorf("create material type: %w", err)
	}
	return toMaterialType(row), nil
}

func (r *Repository) UpdateMaterialType(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error) {
	row, err := r.queries(ctx).UpdateMaterialType(ctx, db.UpdateMaterialTypeParams{
		TenantID: e.TenantID, ID: e.ID, Code: e.Code, Name: e.Name, MaxLoanItems: int32(e.MaxLoanItems), //nolint:gosec // validated
		MaxLoanDays: int32(e.MaxLoanDays), MaxRenewals: int32(e.MaxRenewals), IsActive: e.IsActive, SortOrder: int32(e.SortOrder), //nolint:gosec // validated
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.MasterEntry{}, domain.ErrMasterDataNotFound
	}
	if isUnique(err) {
		return domain.MasterEntry{}, domain.ErrMasterDataCodeExists
	}
	if err != nil {
		return domain.MasterEntry{}, fmt.Errorf("update material type: %w", err)
	}
	return toMaterialType(row), nil
}

func (r *Repository) GetMaterialType(ctx context.Context, tenantID, id uuid.UUID) (domain.MasterEntry, bool, error) {
	row, err := r.queries(ctx).GetMaterialType(ctx, db.GetMaterialTypeParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.MasterEntry{}, false, nil
	}
	if err != nil {
		return domain.MasterEntry{}, false, fmt.Errorf("get material type: %w", err)
	}
	return toMaterialType(row), true, nil
}

func (r *Repository) ListMaterialTypes(ctx context.Context, tenantID uuid.UUID) ([]domain.MasterEntry, error) {
	rows, err := r.queries(ctx).ListMaterialTypes(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list material types: %w", err)
	}
	out := make([]domain.MasterEntry, len(rows))
	for i, row := range rows {
		out[i] = toMaterialType(row)
	}
	return out, nil
}

func (r *Repository) DeleteMaterialType(ctx context.Context, tenantID, id uuid.UUID) (bool, error) {
	n, err := r.queries(ctx).DeleteMaterialType(ctx, db.DeleteMaterialTypeParams{TenantID: tenantID, ID: id})
	if err != nil {
		return false, fmt.Errorf("delete material type: %w", err)
	}
	return n > 0, nil
}

func (r *Repository) CountMaterialTypeUsage(ctx context.Context, tenantID, id uuid.UUID) (int, error) {
	n, err := r.queries(ctx).CountMaterialTypeUsage(ctx, db.CountMaterialTypeUsageParams{TenantID: tenantID, MaterialTypeID: pgUUID(id)})
	if err != nil {
		return 0, fmt.Errorf("count material type usage: %w", err)
	}
	return int(n), nil
}

// Collection categories.

func (r *Repository) CreateCollectionCategory(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error) {
	row, err := r.queries(ctx).CreateCollectionCategory(ctx, db.CreateCollectionCategoryParams{
		TenantID: e.TenantID, Code: e.Code, Name: e.Name, IsActive: e.IsActive, SortOrder: int32(e.SortOrder), //nolint:gosec // validated
	})
	if isUnique(err) {
		return domain.MasterEntry{}, domain.ErrMasterDataCodeExists
	}
	if err != nil {
		return domain.MasterEntry{}, fmt.Errorf("create collection category: %w", err)
	}
	return toCollectionCategory(row), nil
}

func (r *Repository) UpdateCollectionCategory(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error) {
	row, err := r.queries(ctx).UpdateCollectionCategory(ctx, db.UpdateCollectionCategoryParams{
		TenantID: e.TenantID, ID: e.ID, Code: e.Code, Name: e.Name, IsActive: e.IsActive, SortOrder: int32(e.SortOrder), //nolint:gosec // validated
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.MasterEntry{}, domain.ErrMasterDataNotFound
	}
	if isUnique(err) {
		return domain.MasterEntry{}, domain.ErrMasterDataCodeExists
	}
	if err != nil {
		return domain.MasterEntry{}, fmt.Errorf("update collection category: %w", err)
	}
	return toCollectionCategory(row), nil
}

func (r *Repository) GetCollectionCategory(ctx context.Context, tenantID, id uuid.UUID) (domain.MasterEntry, bool, error) {
	row, err := r.queries(ctx).GetCollectionCategory(ctx, db.GetCollectionCategoryParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.MasterEntry{}, false, nil
	}
	if err != nil {
		return domain.MasterEntry{}, false, fmt.Errorf("get collection category: %w", err)
	}
	return toCollectionCategory(row), true, nil
}

func (r *Repository) ListCollectionCategories(ctx context.Context, tenantID uuid.UUID) ([]domain.MasterEntry, error) {
	rows, err := r.queries(ctx).ListCollectionCategories(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list collection categories: %w", err)
	}
	out := make([]domain.MasterEntry, len(rows))
	for i, row := range rows {
		out[i] = toCollectionCategory(row)
	}
	return out, nil
}

func (r *Repository) DeleteCollectionCategory(ctx context.Context, tenantID, id uuid.UUID) (bool, error) {
	n, err := r.queries(ctx).DeleteCollectionCategory(ctx, db.DeleteCollectionCategoryParams{TenantID: tenantID, ID: id})
	if err != nil {
		return false, fmt.Errorf("delete collection category: %w", err)
	}
	return n > 0, nil
}

func (r *Repository) CountCollectionCategoryUsage(ctx context.Context, tenantID, id uuid.UUID) (int, error) {
	n, err := r.queries(ctx).CountCollectionCategoryUsage(ctx, db.CountCollectionCategoryUsageParams{TenantID: tenantID, CategoryID: pgUUID(id)})
	if err != nil {
		return 0, fmt.Errorf("count collection category usage: %w", err)
	}
	return int(n), nil
}

// Acquisition sources.

func (r *Repository) CreateAcquisitionSource(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error) {
	row, err := r.queries(ctx).CreateAcquisitionSource(ctx, db.CreateAcquisitionSourceParams{
		TenantID: e.TenantID, Code: e.Code, Name: e.Name, IsActive: e.IsActive, SortOrder: int32(e.SortOrder), //nolint:gosec // validated
	})
	if isUnique(err) {
		return domain.MasterEntry{}, domain.ErrMasterDataCodeExists
	}
	if err != nil {
		return domain.MasterEntry{}, fmt.Errorf("create acquisition source: %w", err)
	}
	return toAcquisitionSource(row), nil
}

func (r *Repository) UpdateAcquisitionSource(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error) {
	row, err := r.queries(ctx).UpdateAcquisitionSource(ctx, db.UpdateAcquisitionSourceParams{
		TenantID: e.TenantID, ID: e.ID, Code: e.Code, Name: e.Name, IsActive: e.IsActive, SortOrder: int32(e.SortOrder), //nolint:gosec // validated
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.MasterEntry{}, domain.ErrMasterDataNotFound
	}
	if isUnique(err) {
		return domain.MasterEntry{}, domain.ErrMasterDataCodeExists
	}
	if err != nil {
		return domain.MasterEntry{}, fmt.Errorf("update acquisition source: %w", err)
	}
	return toAcquisitionSource(row), nil
}

func (r *Repository) GetAcquisitionSource(ctx context.Context, tenantID, id uuid.UUID) (domain.MasterEntry, bool, error) {
	row, err := r.queries(ctx).GetAcquisitionSource(ctx, db.GetAcquisitionSourceParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.MasterEntry{}, false, nil
	}
	if err != nil {
		return domain.MasterEntry{}, false, fmt.Errorf("get acquisition source: %w", err)
	}
	return toAcquisitionSource(row), true, nil
}

func (r *Repository) ListAcquisitionSources(ctx context.Context, tenantID uuid.UUID) ([]domain.MasterEntry, error) {
	rows, err := r.queries(ctx).ListAcquisitionSources(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list acquisition sources: %w", err)
	}
	out := make([]domain.MasterEntry, len(rows))
	for i, row := range rows {
		out[i] = toAcquisitionSource(row)
	}
	return out, nil
}

func (r *Repository) DeleteAcquisitionSource(ctx context.Context, tenantID, id uuid.UUID) (bool, error) {
	n, err := r.queries(ctx).DeleteAcquisitionSource(ctx, db.DeleteAcquisitionSourceParams{TenantID: tenantID, ID: id})
	if err != nil {
		return false, fmt.Errorf("delete acquisition source: %w", err)
	}
	return n > 0, nil
}

func (r *Repository) CountAcquisitionSourceUsage(ctx context.Context, tenantID, id uuid.UUID) (int, error) {
	n, err := r.queries(ctx).CountAcquisitionSourceUsage(ctx, db.CountAcquisitionSourceUsageParams{TenantID: tenantID, SourceID: pgUUID(id)})
	if err != nil {
		return 0, fmt.Errorf("count acquisition source usage: %w", err)
	}
	return int(n), nil
}

// Partners.

func (r *Repository) CreatePartner(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error) {
	row, err := r.queries(ctx).CreatePartner(ctx, db.CreatePartnerParams{
		TenantID: e.TenantID, Code: e.Code, Name: e.Name, ContactName: e.ContactName, Phone: e.Phone, Address: e.Address,
		IsActive: e.IsActive, SortOrder: int32(e.SortOrder), //nolint:gosec // validated
	})
	if isUnique(err) {
		return domain.MasterEntry{}, domain.ErrMasterDataCodeExists
	}
	if err != nil {
		return domain.MasterEntry{}, fmt.Errorf("create partner: %w", err)
	}
	return toPartner(row), nil
}

func (r *Repository) UpdatePartner(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error) {
	row, err := r.queries(ctx).UpdatePartner(ctx, db.UpdatePartnerParams{
		TenantID: e.TenantID, ID: e.ID, Code: e.Code, Name: e.Name, ContactName: e.ContactName, Phone: e.Phone, Address: e.Address,
		IsActive: e.IsActive, SortOrder: int32(e.SortOrder), //nolint:gosec // validated
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.MasterEntry{}, domain.ErrMasterDataNotFound
	}
	if isUnique(err) {
		return domain.MasterEntry{}, domain.ErrMasterDataCodeExists
	}
	if err != nil {
		return domain.MasterEntry{}, fmt.Errorf("update partner: %w", err)
	}
	return toPartner(row), nil
}

func (r *Repository) GetPartner(ctx context.Context, tenantID, id uuid.UUID) (domain.MasterEntry, bool, error) {
	row, err := r.queries(ctx).GetPartner(ctx, db.GetPartnerParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.MasterEntry{}, false, nil
	}
	if err != nil {
		return domain.MasterEntry{}, false, fmt.Errorf("get partner: %w", err)
	}
	return toPartner(row), true, nil
}

func (r *Repository) ListPartners(ctx context.Context, tenantID uuid.UUID) ([]domain.MasterEntry, error) {
	rows, err := r.queries(ctx).ListPartners(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list partners: %w", err)
	}
	out := make([]domain.MasterEntry, len(rows))
	for i, row := range rows {
		out[i] = toPartner(row)
	}
	return out, nil
}

func (r *Repository) DeletePartner(ctx context.Context, tenantID, id uuid.UUID) (bool, error) {
	n, err := r.queries(ctx).DeletePartner(ctx, db.DeletePartnerParams{TenantID: tenantID, ID: id})
	if err != nil {
		return false, fmt.Errorf("delete partner: %w", err)
	}
	return n > 0, nil
}

func (r *Repository) CountPartnerUsage(ctx context.Context, tenantID, id uuid.UUID) (int, error) {
	n, err := r.queries(ctx).CountPartnerUsage(ctx, db.CountPartnerUsageParams{TenantID: tenantID, PartnerID: pgUUID(id)})
	if err != nil {
		return 0, fmt.Errorf("count partner usage: %w", err)
	}
	return int(n), nil
}

// Locations.

func (r *Repository) CreateLocation(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error) {
	row, err := r.queries(ctx).CreateLocation(ctx, db.CreateLocationParams{
		TenantID: e.TenantID, Code: e.Code, Name: e.Name, IsActive: e.IsActive, SortOrder: int32(e.SortOrder), //nolint:gosec // validated
	})
	if isUnique(err) {
		return domain.MasterEntry{}, domain.ErrMasterDataCodeExists
	}
	if err != nil {
		return domain.MasterEntry{}, fmt.Errorf("create location: %w", err)
	}
	return toLocation(row), nil
}

func (r *Repository) UpdateLocation(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error) {
	row, err := r.queries(ctx).UpdateLocation(ctx, db.UpdateLocationParams{
		TenantID: e.TenantID, ID: e.ID, Code: e.Code, Name: e.Name, IsActive: e.IsActive, SortOrder: int32(e.SortOrder), //nolint:gosec // validated
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.MasterEntry{}, domain.ErrMasterDataNotFound
	}
	if isUnique(err) {
		return domain.MasterEntry{}, domain.ErrMasterDataCodeExists
	}
	if err != nil {
		return domain.MasterEntry{}, fmt.Errorf("update location: %w", err)
	}
	return toLocation(row), nil
}

func (r *Repository) GetLocation(ctx context.Context, tenantID, id uuid.UUID) (domain.MasterEntry, bool, error) {
	row, err := r.queries(ctx).GetLocation(ctx, db.GetLocationParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.MasterEntry{}, false, nil
	}
	if err != nil {
		return domain.MasterEntry{}, false, fmt.Errorf("get location: %w", err)
	}
	return toLocation(row), true, nil
}

func (r *Repository) ListLocations(ctx context.Context, tenantID uuid.UUID) ([]domain.MasterEntry, error) {
	rows, err := r.queries(ctx).ListLocations(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list locations: %w", err)
	}
	out := make([]domain.MasterEntry, len(rows))
	for i, row := range rows {
		out[i] = toLocation(row)
	}
	return out, nil
}

func (r *Repository) DeleteLocation(ctx context.Context, tenantID, id uuid.UUID) (bool, error) {
	n, err := r.queries(ctx).DeleteLocation(ctx, db.DeleteLocationParams{TenantID: tenantID, ID: id})
	if err != nil {
		return false, fmt.Errorf("delete location: %w", err)
	}
	return n > 0, nil
}

func (r *Repository) CountLocationUsage(ctx context.Context, tenantID, id uuid.UUID) (int, error) {
	n, err := r.queries(ctx).CountLocationUsage(ctx, db.CountLocationUsageParams{TenantID: tenantID, LocationID: pgUUID(id)})
	if err != nil {
		return 0, fmt.Errorf("count location usage: %w", err)
	}
	return int(n), nil
}

// DDC classes.

func (r *Repository) ListDDCClasses(ctx context.Context) ([]domain.DDCClass, error) {
	rows, err := r.queries(ctx).ListDDCClasses(ctx)
	if err != nil {
		return nil, fmt.Errorf("list ddc classes: %w", err)
	}
	out := make([]domain.DDCClass, len(rows))
	for i, row := range rows {
		out[i] = toDDCClass(row)
	}
	return out, nil
}
