package service

import (
	"context"
	"strings"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
)

// TitleWithAvailability is a title plus its live copy counts, for the
// catalogue list and the public OPAC.
type TitleWithAvailability struct {
	domain.Title
	TotalCopies     int
	AvailableCopies int
}

// prepareTitle normalizes the ISBN and fills the default language and
// call number the same way for create and update, so both paths apply
// the old app's rules identically.
func prepareTitle(t domain.Title) (domain.Title, error) {
	if t.Title == "" {
		return domain.Title{}, domain.ErrInvalidInput
	}
	if t.Language == "" {
		t.Language = "ind"
	}
	t.ISBN = domain.NormalizeISBN(t.ISBN)
	if t.CallNumber == "" {
		t.CallNumber = autoCallNumber(t)
	}
	return t, nil
}

// autoCallNumber is the call number a title gets when nobody typed one:
// class number, author letters, title letter. The class number is the DDC
// number, or the free-text classification when that is itself a DDC
// number ("899.221"), which is how titles catalogued by hand before the
// form had a DDC field recorded it.
func autoCallNumber(t domain.Title) string {
	class := t.DDCNumber
	if class == "" && domain.LooksLikeDDC(t.Classification) {
		class = strings.TrimSpace(t.Classification)
	}
	return domain.GenerateCallNumber(class, t.Author, t.Title)
}

func (s *Service) CreateTitle(ctx context.Context, t domain.Title, copyCount int, copyDefaults CopyDefaults) (domain.Title, []domain.Copy, error) {
	if err := s.requireEnabled(ctx, t.TenantID); err != nil {
		return domain.Title{}, nil, err
	}
	t, err := prepareTitle(t)
	if err != nil {
		return domain.Title{}, nil, err
	}
	if copyCount < 0 || copyCount > 200 {
		return domain.Title{}, nil, domain.ErrInvalidInput
	}
	var created domain.Title
	var copies []domain.Copy
	err = s.withTx(ctx, t.TenantID, func(ctx context.Context) error {
		var err error
		created, err = s.repo.CreateTitle(ctx, t)
		if err != nil {
			return err
		}
		for i := 0; i < copyCount; i++ {
			c, err := s.addCopyTx(ctx, created, copyDefaults)
			if err != nil {
				return err
			}
			copies = append(copies, c)
		}
		return nil
	})
	if err != nil {
		return domain.Title{}, nil, err
	}
	return created, copies, nil
}

// UpdateTitle saves a title. A call number that was generated (it still
// equals what the stored DDC, author and title produce) is regenerated
// from the new values, so correcting the DDC number fixes the call number
// too; one the librarian typed is kept. Copies that inherited the old call
// number follow the new one, and making a hidden title public makes its
// copies public too.
func (s *Service) UpdateTitle(ctx context.Context, t domain.Title) (domain.Title, error) {
	if err := s.requireEnabled(ctx, t.TenantID); err != nil {
		return domain.Title{}, err
	}
	if t.Title == "" {
		return domain.Title{}, domain.ErrInvalidInput
	}
	var updated domain.Title
	err := s.withTx(ctx, t.TenantID, func(ctx context.Context) error {
		existing, found, err := s.repo.GetTitle(ctx, t.TenantID, t.ID)
		if err != nil {
			return err
		}
		if !found {
			return domain.ErrTitleNotFound
		}
		if t.CallNumber == existing.CallNumber && existing.CallNumber == autoCallNumber(existing) {
			t.CallNumber = ""
		}
		t, err = prepareTitle(t)
		if err != nil {
			return err
		}
		updated, err = s.repo.UpdateTitle(ctx, t)
		if err != nil {
			return err
		}
		if !existing.IsOPAC && updated.IsOPAC {
			if err := s.repo.PublishTitleCopies(ctx, t.TenantID, t.ID); err != nil {
				return err
			}
		}
		if existing.CallNumber != "" && updated.CallNumber != existing.CallNumber {
			return s.repo.RenameInheritedCopyCallNumbers(ctx, t.TenantID, t.ID, existing.CallNumber, updated.CallNumber)
		}
		return nil
	})
	return updated, err
}

func (s *Service) GetTitle(ctx context.Context, tenantID, id uuid.UUID) (TitleWithAvailability, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return TitleWithAvailability{}, err
	}
	var out TitleWithAvailability
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		title, found, err := s.repo.GetTitle(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if !found {
			return domain.ErrTitleNotFound
		}
		out, err = s.withAvailability(ctx, tenantID, title)
		return err
	})
	return out, err
}

// LookupTitleByISBN finds an existing title with the same (normalized)
// ISBN, for the catalogue's duplicate check before someone types in a
// book that is already on the shelf.
func (s *Service) LookupTitleByISBN(ctx context.Context, tenantID uuid.UUID, isbn string) (TitleWithAvailability, bool, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return TitleWithAvailability{}, false, err
	}
	normalized := domain.NormalizeISBN(isbn)
	if normalized == "" {
		return TitleWithAvailability{}, false, domain.ErrInvalidInput
	}
	var out TitleWithAvailability
	var found bool
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		title, ok, err := s.repo.GetTitleByISBN(ctx, tenantID, normalized)
		if err != nil || !ok {
			return err
		}
		found = ok
		out, err = s.withAvailability(ctx, tenantID, title)
		return err
	})
	return out, found, err
}

// DeleteTitle removes a title, refusing while it still has copies --
// weed the copies first (or move them to another title) so a bibliography
// deletion can never silently orphan shelf items.
func (s *Service) DeleteTitle(ctx context.Context, tenantID, id uuid.UUID) error {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return err
	}
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		count, err := s.repo.CountTitleCopies(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if count > 0 {
			return domain.ErrTitleHasCopies
		}
		ok, err := s.repo.DeleteTitle(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrTitleNotFound
		}
		return nil
	})
}

// TitleSearch is the catalogue list/search request, translated from
// transport query parameters into the filter the repository understands.
type TitleSearch struct {
	Search         string
	MaterialTypeID uuid.NullUUID
	DDCClass       string
	AvailableOnly  bool
	Sort           string
	Limit          int
	Offset         int
}

func (s *Service) ListTitles(ctx context.Context, tenantID uuid.UUID, q TitleSearch) ([]TitleWithAvailability, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	filter := TitleFilter{
		MaterialTypeID: q.MaterialTypeID, DDCClass: q.DDCClass, AvailableOnly: q.AvailableOnly, Sort: q.Sort,
	}
	if q.Search != "" {
		filter.Search = q.Search
		filter.SearchISBN = domain.NormalizeISBN(q.Search)
	}
	var out []TitleWithAvailability
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		titles, err := s.repo.ListTitles(ctx, tenantID, filter, clampLimit(q.Limit), q.Offset)
		if err != nil {
			return err
		}
		out = make([]TitleWithAvailability, len(titles))
		for i, t := range titles {
			out[i], err = s.withAvailability(ctx, tenantID, t)
			if err != nil {
				return err
			}
		}
		return nil
	})
	return out, err
}

func (s *Service) withAvailability(ctx context.Context, tenantID uuid.UUID, t domain.Title) (TitleWithAvailability, error) {
	total, err := s.repo.CountTitleCopies(ctx, tenantID, t.ID)
	if err != nil {
		return TitleWithAvailability{}, err
	}
	available, err := s.repo.CountAvailableCopies(ctx, tenantID, t.ID)
	if err != nil {
		return TitleWithAvailability{}, err
	}
	return TitleWithAvailability{Title: t, TotalCopies: total, AvailableCopies: available}, nil
}

func (s *Service) ListCopies(ctx context.Context, tenantID, titleID uuid.UUID) ([]domain.Copy, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	var out []domain.Copy
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListCopiesForTitle(ctx, tenantID, titleID)
		return err
	})
	return out, err
}

func clampLimit(limit int) int {
	if limit <= 0 {
		return 50
	}
	if limit > 200 {
		return 200
	}
	return limit
}
