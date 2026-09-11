package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
)

// CopyDefaults are the fields an auto-generated copy takes from the
// caller: everything except the numbers this package itself derives
// (accession number, barcode, copy number, and the call number it
// inherits from the title unless overridden).
type CopyDefaults struct {
	CategoryID        uuid.NullUUID
	LocationID        uuid.NullUUID
	SourceID          uuid.NullUUID
	PartnerID         uuid.NullUUID
	Price             int
	IsOPAC            bool
	Access            domain.CopyAccess
	Condition         domain.CopyCondition
	Status            domain.CopyStatus
	Notes             string
	AcquiredOn        *time.Time
	CallNumber        string
	RFID              string
	Barcode           string // explicit barcode; empty means auto-generate
	AccessionOverride string // explicit accession number; empty means auto-generate
}

// maxAccessionRetries mirrors the old app's retry budget for a generated
// number that collides with one already on file (library_items.go: up to
// 5 attempts before giving up).
const maxAccessionRetries = 5

func (s *Service) addCopyTx(ctx context.Context, title domain.Title, defaults CopyDefaults) (domain.Copy, error) {
	access := defaults.Access
	if access == "" {
		access = domain.AccessLoanable
	}
	condition := defaults.Condition
	if !condition.Valid() {
		condition = domain.ConditionGood
	}
	status := defaults.Status
	if status == "" {
		status = domain.CopyAvailable
	}
	if !status.Creatable() {
		return domain.Copy{}, domain.ErrInvalidInput
	}
	callNumber := defaults.CallNumber
	if callNumber == "" {
		callNumber = title.CallNumber
	}

	existingCount, err := s.repo.CountTitleCopies(ctx, title.TenantID, title.ID)
	if err != nil {
		return domain.Copy{}, err
	}

	base := domain.Copy{
		TenantID: title.TenantID, TitleID: title.ID, CopyNumber: existingCount + 1, CallNumber: callNumber,
		CategoryID: defaults.CategoryID, LocationID: defaults.LocationID, SourceID: defaults.SourceID, PartnerID: defaults.PartnerID,
		Price: defaults.Price, IsOPAC: defaults.IsOPAC, RFID: defaults.RFID, Access: access, Condition: condition, Status: status,
		Notes: defaults.Notes, AcquiredOn: defaults.AcquiredOn,
	}

	var created domain.Copy
	settings := s.librarySettings(ctx, title.TenantID)
	year := s.clock.Now().Year()
	explicit := defaults.Barcode != "" || defaults.AccessionOverride != ""

	for attempt := 0; attempt < maxAccessionRetries; attempt++ {
		c := base
		c.AccessionNumber = defaults.AccessionOverride
		c.Barcode = defaults.Barcode
		if c.AccessionNumber == "" {
			seq, err := s.repo.NextAccessionSequence(ctx, title.TenantID, year)
			if err != nil {
				return domain.Copy{}, err
			}
			c.AccessionNumber = domain.FormatAccessionNumber(settings.AccessionNumberPattern, year, seq)
		}
		if c.Barcode == "" {
			if settings.BarcodeSource == "sequence" {
				seq, err := s.repo.NextBarcodeSequence(ctx, title.TenantID)
				if err != nil {
					return domain.Copy{}, err
				}
				c.Barcode = domain.FormatBarcodeSequence(seq)
			} else {
				c.Barcode = c.AccessionNumber
			}
		}

		created, err = s.repo.CreateCopy(ctx, c)
		if err == nil {
			break
		}
		if explicit || (!errors.Is(err, domain.ErrCopyAccessionExists) && !errors.Is(err, domain.ErrCopyBarcodeExists)) {
			return domain.Copy{}, err
		}
		// A generated number collided (e.g. a concurrent create advanced
		// the sequence past a manually entered value already on file):
		// retry with a freshly drawn number.
	}
	if err != nil {
		return domain.Copy{}, err
	}

	if err := s.repo.CreateItemEvent(ctx, domain.ItemEvent{
		TenantID: title.TenantID, CopyID: created.ID, EventType: domain.ItemEventCreated, ToStatus: string(created.Status),
	}); err != nil {
		return domain.Copy{}, err
	}
	return created, nil
}

// AddCopy creates one copy for an existing title.
func (s *Service) AddCopy(ctx context.Context, tenantID, titleID uuid.UUID, defaults CopyDefaults) (domain.Copy, error) {
	title, found, err := s.repo.GetTitle(ctx, tenantID, titleID)
	if err != nil {
		return domain.Copy{}, err
	}
	if !found {
		return domain.Copy{}, domain.ErrTitleNotFound
	}
	var created domain.Copy
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		created, err = s.addCopyTx(ctx, title, defaults)
		return err
	})
	return created, err
}

// AddCopies creates count new copies for an existing title in one
// transaction (old app: "tambah eksemplar cepat", POST
// /bibliographies/{id}/copies with a count).
func (s *Service) AddCopies(ctx context.Context, tenantID, titleID uuid.UUID, count int, defaults CopyDefaults) ([]domain.Copy, error) {
	if count < 1 || count > 200 {
		return nil, domain.ErrInvalidInput
	}
	title, found, err := s.repo.GetTitle(ctx, tenantID, titleID)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, domain.ErrTitleNotFound
	}
	// An explicit barcode/accession number is only honoured when adding a
	// single copy; a batch always auto-generates every number so copies
	// never collide with each other.
	if count > 1 {
		defaults.Barcode = ""
		defaults.AccessionOverride = ""
	}
	var copies []domain.Copy
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		for i := 0; i < count; i++ {
			c, err := s.addCopyTx(ctx, title, defaults)
			if err != nil {
				return err
			}
			copies = append(copies, c)
		}
		return nil
	})
	return copies, err
}

func (s *Service) FindCopyByCode(ctx context.Context, tenantID uuid.UUID, code string) (domain.Copy, error) {
	if code == "" {
		return domain.Copy{}, domain.ErrInvalidInput
	}
	c, found, err := s.repo.FindCopyByCode(ctx, tenantID, code)
	if err != nil {
		return domain.Copy{}, err
	}
	if !found {
		return domain.Copy{}, domain.ErrCopyNotFound
	}
	return c, nil
}

// CopySearch is the copies list/filter request.
type CopySearch struct {
	TitleID    uuid.NullUUID
	Status     domain.CopyStatus
	CategoryID uuid.NullUUID
	LocationID uuid.NullUUID
	Search     string
	Limit      int
	Offset     int
}

func (s *Service) ListCopiesFiltered(ctx context.Context, tenantID uuid.UUID, q CopySearch) ([]domain.Copy, error) {
	return s.repo.ListCopiesFiltered(ctx, tenantID, CopyFilter{
		TitleID: q.TitleID, Status: q.Status, CategoryID: q.CategoryID, LocationID: q.LocationID, Search: q.Search,
	}, clampLimit(q.Limit), q.Offset)
}

// SetCopyStatus is the manual status change endpoint: only a librarian's
// own vocabulary (not on_loan/reserved, which only circulation assigns),
// and refused while the copy is out on loan (old app: PUT
// /items/{id}/status).
func (s *Service) SetCopyStatus(ctx context.Context, tenantID, copyID uuid.UUID, actorUserID uuid.UUID, status domain.CopyStatus, condition *domain.CopyCondition, note string) (domain.Copy, error) {
	if !status.ManuallySettable() {
		return domain.Copy{}, domain.ErrCopyStatusNotManual
	}
	var updated domain.Copy
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		current, found, err := s.repo.GetCopy(ctx, tenantID, copyID)
		if err != nil {
			return err
		}
		if !found {
			return domain.ErrCopyNotFound
		}
		if current.Status == domain.CopyOnLoan {
			return domain.ErrCopyOnLoan
		}
		updated, err = s.repo.UpdateCopyStatus(ctx, tenantID, copyID, status, condition)
		if err != nil {
			return err
		}
		return s.repo.CreateItemEvent(ctx, domain.ItemEvent{
			TenantID: tenantID, CopyID: copyID, EventType: domain.ItemEventStatusChanged,
			FromStatus: string(current.Status), ToStatus: string(status), Note: note,
			ActorUserID: uuid.NullUUID{UUID: actorUserID, Valid: actorUserID != uuid.Nil},
		})
	})
	return updated, err
}

// BulkSetCopyStatus changes up to 1000 copies to a manual status at once.
// Copies currently on loan are silently skipped (see
// repository.BulkUpdateCopyStatus) rather than failing the whole batch.
func (s *Service) BulkSetCopyStatus(ctx context.Context, tenantID uuid.UUID, actorUserID uuid.UUID, ids []uuid.UUID, status domain.CopyStatus, note string) ([]domain.Copy, error) {
	if len(ids) == 0 || len(ids) > 1000 {
		return nil, domain.ErrInvalidInput
	}
	if !status.ManuallySettable() {
		return nil, domain.ErrCopyStatusNotManual
	}
	var updated []domain.Copy
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		before, err := s.repo.GetCopiesByIDs(ctx, tenantID, ids)
		if err != nil {
			return err
		}
		beforeByID := make(map[uuid.UUID]domain.Copy, len(before))
		for _, c := range before {
			beforeByID[c.ID] = c
		}
		updated, err = s.repo.BulkUpdateCopyStatus(ctx, tenantID, ids, status)
		if err != nil {
			return err
		}
		for _, c := range updated {
			from := beforeByID[c.ID].Status
			if from == status {
				continue // no-op: don't write a no-change event
			}
			if err := s.repo.CreateItemEvent(ctx, domain.ItemEvent{
				TenantID: tenantID, CopyID: c.ID, EventType: domain.ItemEventStatusChanged,
				FromStatus: string(from), ToStatus: string(status), Note: note,
				ActorUserID: uuid.NullUUID{UUID: actorUserID, Valid: actorUserID != uuid.Nil},
			}); err != nil {
				return err
			}
		}
		return nil
	})
	return updated, err
}

// DeleteCopy removes a copy that was never borrowed. A copy with loan
// history is kept for the audit trail; weed it with a status change to
// "lost" or "donated" instead (old app: items.go:769-790).
func (s *Service) DeleteCopy(ctx context.Context, tenantID, copyID uuid.UUID) error {
	hasHistory, err := s.repo.HasLoanHistory(ctx, tenantID, copyID)
	if err != nil {
		return err
	}
	if hasHistory {
		return domain.ErrCopyHasLoanHistory
	}
	ok, err := s.repo.DeleteCopy(ctx, tenantID, copyID)
	if err != nil {
		return err
	}
	if !ok {
		return domain.ErrCopyNotFound
	}
	return nil
}

func (s *Service) ListItemEvents(ctx context.Context, tenantID, copyID uuid.UUID) ([]domain.ItemEvent, error) {
	return s.repo.ListItemEvents(ctx, tenantID, copyID)
}
