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
	var materialTypes, categories, sources, partners, locations []domain.MasterEntry
	var ddc []domain.DDCClass
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		materialTypes, err = s.repo.ListMaterialTypes(ctx, tenantID)
		if err != nil {
			return err
		}
		categories, err = s.repo.ListCollectionCategories(ctx, tenantID)
		if err != nil {
			return err
		}
		sources, err = s.repo.ListAcquisitionSources(ctx, tenantID)
		if err != nil {
			return err
		}
		partners, err = s.repo.ListPartners(ctx, tenantID)
		if err != nil {
			return err
		}
		locations, err = s.repo.ListLocations(ctx, tenantID)
		if err != nil {
			return err
		}
		ddc, err = s.repo.ListDDCClasses(ctx)
		return err
	})
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
	var created domain.MasterEntry
	err := s.withTx(ctx, e.TenantID, func(ctx context.Context) error {
		var err error
		created, err = s.repo.CreateMaterialType(ctx, e)
		return err
	})
	return created, err
}

func (s *Service) UpdateMaterialType(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error) {
	if err := s.requireEnabled(ctx, e.TenantID); err != nil {
		return domain.MasterEntry{}, err
	}
	if err := e.Validate(domain.MasterMaterialType); err != nil {
		return domain.MasterEntry{}, err
	}
	var updated domain.MasterEntry
	err := s.withTx(ctx, e.TenantID, func(ctx context.Context) error {
		var err error
		updated, err = s.repo.UpdateMaterialType(ctx, e)
		return err
	})
	return updated, err
}

func (s *Service) ListMaterialTypes(ctx context.Context, tenantID uuid.UUID) ([]domain.MasterEntry, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	var out []domain.MasterEntry
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListMaterialTypes(ctx, tenantID)
		return err
	})
	return out, err
}

func (s *Service) DeleteMaterialType(ctx context.Context, tenantID, id uuid.UUID) error {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return err
	}
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
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
	})
}

// Collection categories.

func (s *Service) CreateCollectionCategory(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error) {
	if err := s.requireEnabled(ctx, e.TenantID); err != nil {
		return domain.MasterEntry{}, err
	}
	if err := e.Validate(domain.MasterCollectionCategory); err != nil {
		return domain.MasterEntry{}, err
	}
	var created domain.MasterEntry
	err := s.withTx(ctx, e.TenantID, func(ctx context.Context) error {
		var err error
		created, err = s.repo.CreateCollectionCategory(ctx, e)
		return err
	})
	return created, err
}

func (s *Service) UpdateCollectionCategory(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error) {
	if err := s.requireEnabled(ctx, e.TenantID); err != nil {
		return domain.MasterEntry{}, err
	}
	if err := e.Validate(domain.MasterCollectionCategory); err != nil {
		return domain.MasterEntry{}, err
	}
	var updated domain.MasterEntry
	err := s.withTx(ctx, e.TenantID, func(ctx context.Context) error {
		var err error
		updated, err = s.repo.UpdateCollectionCategory(ctx, e)
		return err
	})
	return updated, err
}

func (s *Service) ListCollectionCategories(ctx context.Context, tenantID uuid.UUID) ([]domain.MasterEntry, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	var out []domain.MasterEntry
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListCollectionCategories(ctx, tenantID)
		return err
	})
	return out, err
}

func (s *Service) DeleteCollectionCategory(ctx context.Context, tenantID, id uuid.UUID) error {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return err
	}
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
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
	})
}

// Acquisition sources.

func (s *Service) CreateAcquisitionSource(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error) {
	if err := s.requireEnabled(ctx, e.TenantID); err != nil {
		return domain.MasterEntry{}, err
	}
	if err := e.Validate(domain.MasterAcquisitionSource); err != nil {
		return domain.MasterEntry{}, err
	}
	var created domain.MasterEntry
	err := s.withTx(ctx, e.TenantID, func(ctx context.Context) error {
		var err error
		created, err = s.repo.CreateAcquisitionSource(ctx, e)
		return err
	})
	return created, err
}

func (s *Service) UpdateAcquisitionSource(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error) {
	if err := s.requireEnabled(ctx, e.TenantID); err != nil {
		return domain.MasterEntry{}, err
	}
	if err := e.Validate(domain.MasterAcquisitionSource); err != nil {
		return domain.MasterEntry{}, err
	}
	var updated domain.MasterEntry
	err := s.withTx(ctx, e.TenantID, func(ctx context.Context) error {
		var err error
		updated, err = s.repo.UpdateAcquisitionSource(ctx, e)
		return err
	})
	return updated, err
}

func (s *Service) ListAcquisitionSources(ctx context.Context, tenantID uuid.UUID) ([]domain.MasterEntry, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	var out []domain.MasterEntry
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListAcquisitionSources(ctx, tenantID)
		return err
	})
	return out, err
}

func (s *Service) DeleteAcquisitionSource(ctx context.Context, tenantID, id uuid.UUID) error {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return err
	}
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
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
	})
}

// Partners.

func (s *Service) CreatePartner(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error) {
	if err := s.requireEnabled(ctx, e.TenantID); err != nil {
		return domain.MasterEntry{}, err
	}
	if err := e.Validate(domain.MasterPartner); err != nil {
		return domain.MasterEntry{}, err
	}
	var created domain.MasterEntry
	err := s.withTx(ctx, e.TenantID, func(ctx context.Context) error {
		var err error
		created, err = s.repo.CreatePartner(ctx, e)
		return err
	})
	return created, err
}

func (s *Service) UpdatePartner(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error) {
	if err := s.requireEnabled(ctx, e.TenantID); err != nil {
		return domain.MasterEntry{}, err
	}
	if err := e.Validate(domain.MasterPartner); err != nil {
		return domain.MasterEntry{}, err
	}
	var updated domain.MasterEntry
	err := s.withTx(ctx, e.TenantID, func(ctx context.Context) error {
		var err error
		updated, err = s.repo.UpdatePartner(ctx, e)
		return err
	})
	return updated, err
}

func (s *Service) ListPartners(ctx context.Context, tenantID uuid.UUID) ([]domain.MasterEntry, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	var out []domain.MasterEntry
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListPartners(ctx, tenantID)
		return err
	})
	return out, err
}

func (s *Service) DeletePartner(ctx context.Context, tenantID, id uuid.UUID) error {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return err
	}
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
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
	})
}

// Locations.

func (s *Service) CreateLocation(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error) {
	if err := s.requireEnabled(ctx, e.TenantID); err != nil {
		return domain.MasterEntry{}, err
	}
	if err := e.Validate(domain.MasterLocation); err != nil {
		return domain.MasterEntry{}, err
	}
	var created domain.MasterEntry
	err := s.withTx(ctx, e.TenantID, func(ctx context.Context) error {
		var err error
		created, err = s.repo.CreateLocation(ctx, e)
		return err
	})
	return created, err
}

func (s *Service) UpdateLocation(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error) {
	if err := s.requireEnabled(ctx, e.TenantID); err != nil {
		return domain.MasterEntry{}, err
	}
	if err := e.Validate(domain.MasterLocation); err != nil {
		return domain.MasterEntry{}, err
	}
	var updated domain.MasterEntry
	err := s.withTx(ctx, e.TenantID, func(ctx context.Context) error {
		var err error
		updated, err = s.repo.UpdateLocation(ctx, e)
		return err
	})
	return updated, err
}

func (s *Service) ListLocations(ctx context.Context, tenantID uuid.UUID) ([]domain.MasterEntry, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	var out []domain.MasterEntry
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListLocations(ctx, tenantID)
		return err
	})
	return out, err
}

func (s *Service) DeleteLocation(ctx context.Context, tenantID, id uuid.UUID) error {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return err
	}
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
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
	})
}
