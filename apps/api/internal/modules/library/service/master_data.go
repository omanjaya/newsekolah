package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
)

// CatalogueOptions bundles every master-data list the catalogue's create
// and edit forms need in one round trip, the same as the old app's
// combined "options" endpoint.
type CatalogueOptions struct {
	MaterialTypes        []domain.MasterEntry
	CollectionCategories []domain.MasterEntry
	AcquisitionSources   []domain.MasterEntry
	Partners             []domain.MasterEntry
	Locations            []domain.MasterEntry
	DDCClasses           []domain.DDCClass
}

func (s *Service) ListDDCClasses(ctx context.Context) ([]domain.DDCClass, error) {
	return s.repo.ListDDCClasses(ctx)
}

func (s *Service) CatalogueOptions(ctx context.Context, tenantID uuid.UUID) (CatalogueOptions, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return CatalogueOptions{}, err
	}
	materialTypes, err := s.repo.ListMaterialTypes(ctx, tenantID)
	if err != nil {
		return CatalogueOptions{}, err
	}
	categories, err := s.repo.ListCollectionCategories(ctx, tenantID)
	if err != nil {
		return CatalogueOptions{}, err
	}
	sources, err := s.repo.ListAcquisitionSources(ctx, tenantID)
	if err != nil {
		return CatalogueOptions{}, err
	}
	partners, err := s.repo.ListPartners(ctx, tenantID)
	if err != nil {
		return CatalogueOptions{}, err
	}
	locations, err := s.repo.ListLocations(ctx, tenantID)
	if err != nil {
		return CatalogueOptions{}, err
	}
	ddc, err := s.repo.ListDDCClasses(ctx)
	if err != nil {
		return CatalogueOptions{}, err
	}
	return CatalogueOptions{
		MaterialTypes: materialTypes, CollectionCategories: categories, AcquisitionSources: sources,
		Partners: partners, Locations: locations, DDCClasses: ddc,
	}, nil
}

// Material types.

func (s *Service) CreateMaterialType(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error) {
	if err := s.requireEnabled(ctx, e.TenantID); err != nil {
		return domain.MasterEntry{}, err
	}
	if err := e.Validate(domain.MasterMaterialType); err != nil {
		return domain.MasterEntry{}, err
	}
	return s.repo.CreateMaterialType(ctx, e)
}

func (s *Service) UpdateMaterialType(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error) {
	if err := s.requireEnabled(ctx, e.TenantID); err != nil {
		return domain.MasterEntry{}, err
	}
	if err := e.Validate(domain.MasterMaterialType); err != nil {
		return domain.MasterEntry{}, err
	}
	return s.repo.UpdateMaterialType(ctx, e)
}

func (s *Service) ListMaterialTypes(ctx context.Context, tenantID uuid.UUID) ([]domain.MasterEntry, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	return s.repo.ListMaterialTypes(ctx, tenantID)
}

func (s *Service) DeleteMaterialType(ctx context.Context, tenantID, id uuid.UUID) error {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return err
	}
	used, err := s.repo.CountMaterialTypeUsage(ctx, tenantID, id)
	if err != nil {
		return err
	}
	if used > 0 {
		return domain.ErrMasterDataInUse
	}
	ok, err := s.repo.DeleteMaterialType(ctx, tenantID, id)
	if err != nil {
		return err
	}
	if !ok {
		return domain.ErrMasterDataNotFound
	}
	return nil
}

// Collection categories.

func (s *Service) CreateCollectionCategory(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error) {
	if err := s.requireEnabled(ctx, e.TenantID); err != nil {
		return domain.MasterEntry{}, err
	}
	if err := e.Validate(domain.MasterCollectionCategory); err != nil {
		return domain.MasterEntry{}, err
	}
	return s.repo.CreateCollectionCategory(ctx, e)
}

func (s *Service) UpdateCollectionCategory(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error) {
	if err := s.requireEnabled(ctx, e.TenantID); err != nil {
		return domain.MasterEntry{}, err
	}
	if err := e.Validate(domain.MasterCollectionCategory); err != nil {
		return domain.MasterEntry{}, err
	}
	return s.repo.UpdateCollectionCategory(ctx, e)
}

func (s *Service) ListCollectionCategories(ctx context.Context, tenantID uuid.UUID) ([]domain.MasterEntry, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	return s.repo.ListCollectionCategories(ctx, tenantID)
}

func (s *Service) DeleteCollectionCategory(ctx context.Context, tenantID, id uuid.UUID) error {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return err
	}
	used, err := s.repo.CountCollectionCategoryUsage(ctx, tenantID, id)
	if err != nil {
		return err
	}
	if used > 0 {
		return domain.ErrMasterDataInUse
	}
	ok, err := s.repo.DeleteCollectionCategory(ctx, tenantID, id)
	if err != nil {
		return err
	}
	if !ok {
		return domain.ErrMasterDataNotFound
	}
	return nil
}

// Acquisition sources.

func (s *Service) CreateAcquisitionSource(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error) {
	if err := s.requireEnabled(ctx, e.TenantID); err != nil {
		return domain.MasterEntry{}, err
	}
	if err := e.Validate(domain.MasterAcquisitionSource); err != nil {
		return domain.MasterEntry{}, err
	}
	return s.repo.CreateAcquisitionSource(ctx, e)
}

func (s *Service) UpdateAcquisitionSource(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error) {
	if err := s.requireEnabled(ctx, e.TenantID); err != nil {
		return domain.MasterEntry{}, err
	}
	if err := e.Validate(domain.MasterAcquisitionSource); err != nil {
		return domain.MasterEntry{}, err
	}
	return s.repo.UpdateAcquisitionSource(ctx, e)
}

func (s *Service) ListAcquisitionSources(ctx context.Context, tenantID uuid.UUID) ([]domain.MasterEntry, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	return s.repo.ListAcquisitionSources(ctx, tenantID)
}

func (s *Service) DeleteAcquisitionSource(ctx context.Context, tenantID, id uuid.UUID) error {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return err
	}
	used, err := s.repo.CountAcquisitionSourceUsage(ctx, tenantID, id)
	if err != nil {
		return err
	}
	if used > 0 {
		return domain.ErrMasterDataInUse
	}
	ok, err := s.repo.DeleteAcquisitionSource(ctx, tenantID, id)
	if err != nil {
		return err
	}
	if !ok {
		return domain.ErrMasterDataNotFound
	}
	return nil
}

// Partners.

func (s *Service) CreatePartner(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error) {
	if err := s.requireEnabled(ctx, e.TenantID); err != nil {
		return domain.MasterEntry{}, err
	}
	if err := e.Validate(domain.MasterPartner); err != nil {
		return domain.MasterEntry{}, err
	}
	return s.repo.CreatePartner(ctx, e)
}

func (s *Service) UpdatePartner(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error) {
	if err := s.requireEnabled(ctx, e.TenantID); err != nil {
		return domain.MasterEntry{}, err
	}
	if err := e.Validate(domain.MasterPartner); err != nil {
		return domain.MasterEntry{}, err
	}
	return s.repo.UpdatePartner(ctx, e)
}

func (s *Service) ListPartners(ctx context.Context, tenantID uuid.UUID) ([]domain.MasterEntry, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	return s.repo.ListPartners(ctx, tenantID)
}

func (s *Service) DeletePartner(ctx context.Context, tenantID, id uuid.UUID) error {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return err
	}
	used, err := s.repo.CountPartnerUsage(ctx, tenantID, id)
	if err != nil {
		return err
	}
	if used > 0 {
		return domain.ErrMasterDataInUse
	}
	ok, err := s.repo.DeletePartner(ctx, tenantID, id)
	if err != nil {
		return err
	}
	if !ok {
		return domain.ErrMasterDataNotFound
	}
	return nil
}

// Locations.

func (s *Service) CreateLocation(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error) {
	if err := s.requireEnabled(ctx, e.TenantID); err != nil {
		return domain.MasterEntry{}, err
	}
	if err := e.Validate(domain.MasterLocation); err != nil {
		return domain.MasterEntry{}, err
	}
	return s.repo.CreateLocation(ctx, e)
}

func (s *Service) UpdateLocation(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error) {
	if err := s.requireEnabled(ctx, e.TenantID); err != nil {
		return domain.MasterEntry{}, err
	}
	if err := e.Validate(domain.MasterLocation); err != nil {
		return domain.MasterEntry{}, err
	}
	return s.repo.UpdateLocation(ctx, e)
}

func (s *Service) ListLocations(ctx context.Context, tenantID uuid.UUID) ([]domain.MasterEntry, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	return s.repo.ListLocations(ctx, tenantID)
}

func (s *Service) DeleteLocation(ctx context.Context, tenantID, id uuid.UUID) error {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return err
	}
	used, err := s.repo.CountLocationUsage(ctx, tenantID, id)
	if err != nil {
		return err
	}
	if used > 0 {
		return domain.ErrMasterDataInUse
	}
	ok, err := s.repo.DeleteLocation(ctx, tenantID, id)
	if err != nil {
		return err
	}
	if !ok {
		return domain.ErrMasterDataNotFound
	}
	return nil
}
