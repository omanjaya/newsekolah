// Package repository is the sqlc-backed implementation of the library
// service's data boundary.
package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

type Repository struct{ pool *pgxpool.Pool }

func New(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

var _ service.Repository = (*Repository)(nil)

func (r *Repository) queries(ctx context.Context) *db.Queries {
	if tx, ok := pdatabase.TxFromContext(ctx); ok {
		return db.New(tx)
	}
	return db.New(r.pool)
}

func isUnique(err error) bool {
	var pgErr interface{ SQLState() string }
	return errors.As(err, &pgErr) && pgErr.SQLState() == "23505"
}

// constraintName returns the name of the unique constraint or index a
// write violated, or "" when err isn't a unique violation. Several
// catalogue tables have more than one unique constraint, so callers that
// need to tell them apart check the name instead of assuming isUnique
// means the one error they expected.
func constraintName(err error) string {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return pgErr.ConstraintName
	}
	return ""
}

func int32OrNil(n int) pgtype.Int4 {
	if n <= 0 {
		return pgtype.Int4{}
	}
	return pgtype.Int4{Int32: int32(n), Valid: true} //nolint:gosec // validated range
}

// Titles.

func (r *Repository) CreateTitle(ctx context.Context, t domain.Title) (domain.Title, error) {
	row, err := r.queries(ctx).CreateTitle(ctx, db.CreateTitleParams{
		TenantID: t.TenantID, ControlNumber: t.ControlNumber, Title: t.Title, Subtitle: t.Subtitle, Author: t.Author,
		Responsibility: t.Responsibility, AdditionalAuthors: t.AdditionalAuthors, Publisher: t.Publisher,
		PublishPlace: t.PublishPlace, PublishYear: int32OrNil(t.PublishYear), Edition: t.Edition, Pages: t.Pages,
		Illustration: t.Illustration, Dimensions: t.Dimensions, Isbn: t.ISBN, Issn: t.ISSN, DdcNumber: t.DDCNumber,
		CallNumber: t.CallNumber, Classification: t.Classification, Subjects: t.Subjects, Language: t.Language,
		LiteraryForm: t.LiteraryForm, TargetAudience: t.TargetAudience, Notes: t.Notes, Abstract: t.Abstract,
		MaterialTypeID: pdatabase.NullUUID(t.MaterialTypeID), IsOpac: t.IsOPAC, CoverAssetID: pdatabase.NullUUID(t.CoverAssetID),
	})
	if name := constraintName(err); name == "ux_library_titles_control_number" {
		return domain.Title{}, domain.ErrControlNumberExists
	}
	if err != nil {
		return domain.Title{}, fmt.Errorf("create title: %w", err)
	}
	return toTitle(row), nil
}

func (r *Repository) UpdateTitle(ctx context.Context, t domain.Title) (domain.Title, error) {
	row, err := r.queries(ctx).UpdateTitle(ctx, db.UpdateTitleParams{
		TenantID: t.TenantID, ID: t.ID, ControlNumber: t.ControlNumber, Title: t.Title, Subtitle: t.Subtitle, Author: t.Author,
		Responsibility: t.Responsibility, AdditionalAuthors: t.AdditionalAuthors, Publisher: t.Publisher,
		PublishPlace: t.PublishPlace, PublishYear: int32OrNil(t.PublishYear), Edition: t.Edition, Pages: t.Pages,
		Illustration: t.Illustration, Dimensions: t.Dimensions, Isbn: t.ISBN, Issn: t.ISSN, DdcNumber: t.DDCNumber,
		CallNumber: t.CallNumber, Classification: t.Classification, Subjects: t.Subjects, Language: t.Language,
		LiteraryForm: t.LiteraryForm, TargetAudience: t.TargetAudience, Notes: t.Notes, Abstract: t.Abstract,
		MaterialTypeID: pdatabase.NullUUID(t.MaterialTypeID), IsOpac: t.IsOPAC, CoverAssetID: pdatabase.NullUUID(t.CoverAssetID),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Title{}, domain.ErrTitleNotFound
	}
	if name := constraintName(err); name == "ux_library_titles_control_number" {
		return domain.Title{}, domain.ErrControlNumberExists
	}
	if err != nil {
		return domain.Title{}, fmt.Errorf("update title: %w", err)
	}
	return toTitle(row), nil
}

func (r *Repository) GetTitle(ctx context.Context, tenantID, id uuid.UUID) (domain.Title, bool, error) {
	row, err := r.queries(ctx).GetTitle(ctx, db.GetTitleParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Title{}, false, nil
	}
	if err != nil {
		return domain.Title{}, false, fmt.Errorf("get title: %w", err)
	}
	return toTitle(row), true, nil
}

func (r *Repository) GetTitleByISBN(ctx context.Context, tenantID uuid.UUID, isbn string) (domain.Title, bool, error) {
	row, err := r.queries(ctx).GetTitleByISBN(ctx, db.GetTitleByISBNParams{TenantID: tenantID, Isbn: isbn})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Title{}, false, nil
	}
	if err != nil {
		return domain.Title{}, false, fmt.Errorf("get title by isbn: %w", err)
	}
	return toTitle(row), true, nil
}

func (r *Repository) DeleteTitle(ctx context.Context, tenantID, id uuid.UUID) (bool, error) {
	n, err := r.queries(ctx).DeleteTitle(ctx, db.DeleteTitleParams{TenantID: tenantID, ID: id})
	if err != nil {
		return false, fmt.Errorf("delete title: %w", err)
	}
	return n > 0, nil
}

func (r *Repository) ListTitles(ctx context.Context, tenantID uuid.UUID, f service.TitleFilter, limit, offset int) ([]domain.Title, error) {
	params := db.ListTitlesParams{TenantID: tenantID, Limit: int32(limit), Offset: int32(offset)} //nolint:gosec // clamped by service
	if f.Search != "" {
		params.Search = pdatabase.Text(f.Search)
	}
	if f.SearchISBN != "" {
		params.SearchIsbn = pdatabase.Text(f.SearchISBN)
	}
	if f.MaterialTypeID.Valid {
		params.MaterialTypeID = pdatabase.NullUUID(f.MaterialTypeID)
	}
	if f.DDCClass != "" {
		params.DdcClass = pdatabase.Text(f.DDCClass)
	}
	if f.AvailableOnly {
		params.AvailabilityOnly = pgtype.Bool{Bool: true, Valid: true}
	}
	if f.Sort != "" {
		params.Sort = pdatabase.Text(f.Sort)
	}
	rows, err := r.queries(ctx).ListTitles(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("list titles: %w", err)
	}
	out := make([]domain.Title, len(rows))
	for i, row := range rows {
		out[i] = toTitle(row)
	}
	return out, nil
}

func (r *Repository) CountTitleCopies(ctx context.Context, tenantID, titleID uuid.UUID) (int, error) {
	n, err := r.queries(ctx).CountTitleCopies(ctx, db.CountTitleCopiesParams{TenantID: tenantID, TitleID: titleID})
	if err != nil {
		return 0, fmt.Errorf("count title copies: %w", err)
	}
	return int(n), nil
}

func (r *Repository) CountAvailableCopies(ctx context.Context, tenantID, titleID uuid.UUID) (int, error) {
	n, err := r.queries(ctx).CountAvailableCopies(ctx, db.CountAvailableCopiesParams{TenantID: tenantID, TitleID: titleID})
	if err != nil {
		return 0, fmt.Errorf("count available copies: %w", err)
	}
	return int(n), nil
}

// Copies.

func (r *Repository) CreateCopy(ctx context.Context, c domain.Copy) (domain.Copy, error) {
	row, err := r.queries(ctx).CreateCopy(ctx, db.CreateCopyParams{
		TenantID: c.TenantID, TitleID: c.TitleID, AccessionNumber: c.AccessionNumber, Barcode: c.Barcode,
		CopyNumber: int32(c.CopyNumber), CallNumber: c.CallNumber, //nolint:gosec // clamped by service
		CategoryID: pdatabase.NullUUID(c.CategoryID), LocationID: pdatabase.NullUUID(c.LocationID),
		SourceID: pdatabase.NullUUID(c.SourceID), PartnerID: pdatabase.NullUUID(c.PartnerID),
		Price: int32(c.Price), IsOpac: c.IsOPAC, Rfid: c.RFID, Access: string(c.Access), //nolint:gosec // clamped by service
		Condition: string(c.Condition), Status: string(c.Status), Notes: c.Notes, AcquiredOn: nullableDate(c.AcquiredOn),
	})
	switch constraintName(err) {
	case "ux_library_copies_accession_number":
		return domain.Copy{}, domain.ErrCopyAccessionExists
	case "library_copies_tenant_id_barcode_key":
		return domain.Copy{}, domain.ErrCopyBarcodeExists
	}
	if isUnique(err) {
		return domain.Copy{}, domain.ErrCopyBarcodeExists
	}
	if err != nil {
		return domain.Copy{}, fmt.Errorf("create copy: %w", err)
	}
	return toCopy(row), nil
}

func (r *Repository) GetCopy(ctx context.Context, tenantID, id uuid.UUID) (domain.Copy, bool, error) {
	row, err := r.queries(ctx).GetCopy(ctx, db.GetCopyParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Copy{}, false, nil
	}
	if err != nil {
		return domain.Copy{}, false, fmt.Errorf("get copy: %w", err)
	}
	return toCopy(row), true, nil
}

func (r *Repository) GetCopyByBarcode(ctx context.Context, tenantID uuid.UUID, barcode string) (domain.Copy, bool, error) {
	row, err := r.queries(ctx).GetCopyByBarcode(ctx, db.GetCopyByBarcodeParams{TenantID: tenantID, Barcode: barcode})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Copy{}, false, nil
	}
	if err != nil {
		return domain.Copy{}, false, fmt.Errorf("get copy by barcode: %w", err)
	}
	return toCopy(row), true, nil
}

func (r *Repository) FindCopyByCode(ctx context.Context, tenantID uuid.UUID, code string) (domain.Copy, bool, error) {
	row, err := r.queries(ctx).FindCopyByCode(ctx, db.FindCopyByCodeParams{TenantID: tenantID, Barcode: code})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Copy{}, false, nil
	}
	if err != nil {
		return domain.Copy{}, false, fmt.Errorf("find copy by code: %w", err)
	}
	return toCopy(row), true, nil
}

func (r *Repository) ListCopiesForTitle(ctx context.Context, tenantID, titleID uuid.UUID) ([]domain.Copy, error) {
	rows, err := r.queries(ctx).ListCopiesForTitle(ctx, db.ListCopiesForTitleParams{TenantID: tenantID, TitleID: titleID})
	if err != nil {
		return nil, fmt.Errorf("list copies for title: %w", err)
	}
	out := make([]domain.Copy, len(rows))
	for i, row := range rows {
		out[i] = toCopy(row)
	}
	return out, nil
}

func (r *Repository) ListCopiesForStocktake(ctx context.Context, tenantID uuid.UUID) ([]domain.Copy, error) {
	rows, err := r.queries(ctx).ListCopiesForStocktake(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list copies for stocktake: %w", err)
	}
	out := make([]domain.Copy, len(rows))
	for i, row := range rows {
		out[i] = toCopy(row)
	}
	return out, nil
}

func (r *Repository) ListCopiesFiltered(ctx context.Context, tenantID uuid.UUID, f service.CopyFilter, limit, offset int) ([]domain.Copy, error) {
	params := db.ListCopiesFilteredParams{TenantID: tenantID, Limit: int32(limit), Offset: int32(offset)} //nolint:gosec // clamped by service
	if f.TitleID.Valid {
		params.TitleID = pdatabase.NullUUID(f.TitleID)
	}
	if f.Status != "" {
		params.Status = pdatabase.Text(string(f.Status))
	}
	if f.CategoryID.Valid {
		params.CategoryID = pdatabase.NullUUID(f.CategoryID)
	}
	if f.LocationID.Valid {
		params.LocationID = pdatabase.NullUUID(f.LocationID)
	}
	if f.Search != "" {
		params.Search = pdatabase.Text(f.Search)
	}
	rows, err := r.queries(ctx).ListCopiesFiltered(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("list copies filtered: %w", err)
	}
	out := make([]domain.Copy, len(rows))
	for i, row := range rows {
		out[i] = toCopy(row)
	}
	return out, nil
}

func (r *Repository) GetCopiesByIDs(ctx context.Context, tenantID uuid.UUID, ids []uuid.UUID) ([]domain.Copy, error) {
	rows, err := r.queries(ctx).GetCopiesByIDs(ctx, db.GetCopiesByIDsParams{TenantID: tenantID, Ids: ids})
	if err != nil {
		return nil, fmt.Errorf("get copies by ids: %w", err)
	}
	out := make([]domain.Copy, len(rows))
	for i, row := range rows {
		out[i] = toCopy(row)
	}
	return out, nil
}

func (r *Repository) UpdateCopyStatus(ctx context.Context, tenantID, id uuid.UUID, status domain.CopyStatus, condition *domain.CopyCondition) (domain.Copy, error) {
	params := db.UpdateCopyStatusParams{TenantID: tenantID, ID: id, Status: string(status)}
	if condition != nil {
		params.Condition = pdatabase.Text(string(*condition))
	}
	row, err := r.queries(ctx).UpdateCopyStatus(ctx, params)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Copy{}, domain.ErrCopyNotFound
	}
	if err != nil {
		return domain.Copy{}, fmt.Errorf("update copy status: %w", err)
	}
	return toCopy(row), nil
}

func (r *Repository) BulkUpdateCopyStatus(ctx context.Context, tenantID uuid.UUID, ids []uuid.UUID, status domain.CopyStatus) ([]domain.Copy, error) {
	rows, err := r.queries(ctx).BulkUpdateCopyStatus(ctx, db.BulkUpdateCopyStatusParams{TenantID: tenantID, Ids: ids, Status: string(status)})
	if err != nil {
		return nil, fmt.Errorf("bulk update copy status: %w", err)
	}
	out := make([]domain.Copy, len(rows))
	for i, row := range rows {
		out[i] = toCopy(row)
	}
	return out, nil
}

func (r *Repository) DeleteCopy(ctx context.Context, tenantID, id uuid.UUID) (bool, error) {
	n, err := r.queries(ctx).DeleteCopy(ctx, db.DeleteCopyParams{TenantID: tenantID, ID: id})
	if err != nil {
		return false, fmt.Errorf("delete copy: %w", err)
	}
	return n > 0, nil
}

func (r *Repository) HasLoanHistory(ctx context.Context, tenantID, copyID uuid.UUID) (bool, error) {
	ok, err := r.queries(ctx).HasLoanHistory(ctx, db.HasLoanHistoryParams{TenantID: tenantID, CopyID: copyID})
	if err != nil {
		return false, fmt.Errorf("has loan history: %w", err)
	}
	return ok, nil
}

func (r *Repository) CreateItemEvent(ctx context.Context, e domain.ItemEvent) error {
	if err := r.queries(ctx).CreateItemEvent(ctx, db.CreateItemEventParams{
		TenantID: e.TenantID, CopyID: e.CopyID, EventType: string(e.EventType), FromStatus: e.FromStatus,
		ToStatus: e.ToStatus, Note: e.Note, ActorUserID: pdatabase.NullUUID(e.ActorUserID),
	}); err != nil {
		return fmt.Errorf("create item event: %w", err)
	}
	return nil
}

func (r *Repository) ListItemEvents(ctx context.Context, tenantID, copyID uuid.UUID) ([]domain.ItemEvent, error) {
	rows, err := r.queries(ctx).ListItemEvents(ctx, db.ListItemEventsParams{TenantID: tenantID, CopyID: copyID})
	if err != nil {
		return nil, fmt.Errorf("list item events: %w", err)
	}
	out := make([]domain.ItemEvent, len(rows))
	for i, row := range rows {
		out[i] = domain.ItemEvent{
			ID: row.ID, TenantID: row.TenantID, CopyID: row.CopyID, EventType: domain.ItemEventType(row.EventType),
			FromStatus: row.FromStatus, ToStatus: row.ToStatus, Note: row.Note, ActorUserID: pdatabase.UUIDOrNil(row.ActorUserID),
			CreatedAt: pdatabase.TimeOrZero(row.CreatedAt),
		}
	}
	return out, nil
}

func (r *Repository) NextAccessionSequence(ctx context.Context, tenantID uuid.UUID, year int) (int64, error) {
	n, err := r.queries(ctx).NextAccessionSequence(ctx, db.NextAccessionSequenceParams{TenantID: tenantID, Year: int32(year)}) //nolint:gosec // calendar year
	if err != nil {
		return 0, fmt.Errorf("next accession sequence: %w", err)
	}
	return n, nil
}

func (r *Repository) NextBarcodeSequence(ctx context.Context, tenantID uuid.UUID) (int64, error) {
	n, err := r.queries(ctx).NextBarcodeSequence(ctx, tenantID)
	if err != nil {
		return 0, fmt.Errorf("next barcode sequence: %w", err)
	}
	return n, nil
}

func (r *Repository) FindTitleForDedupe(ctx context.Context, tenantID uuid.UUID, isbn, title, author string) ([]domain.Title, error) {
	params := db.FindTitleForDedupeParams{TenantID: tenantID, Title: title, Author: author}
	if isbn != "" {
		params.Isbn = pdatabase.Text(isbn)
	}
	rows, err := r.queries(ctx).FindTitleForDedupe(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("find title for dedupe: %w", err)
	}
	out := make([]domain.Title, len(rows))
	for i, row := range rows {
		out[i] = toTitle(row)
	}
	return out, nil
}
