package main

import (
	"context"
	"fmt"
	"math"
	"sort"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/cmd/etl/mapping"
)

// migrateLibraryTitles migrates books to library_titles, keyed on isbn
// (present on every row at this school) via select-then-insert, since the
// target has no unique constraint on isbn to upsert against.
func (st *Store) migrateLibraryTitles(ctx context.Context, tenantID uuid.UUID, books []SionBook, stat *TableStat) (IDMap, error) {
	result := make(IDMap, len(books))
	for _, b := range books {
		stat.Read++
		isbn := ""
		if b.ISBN.Valid {
			isbn = mapping.CleanName(b.ISBN.String)
		}

		// A publication year outside int32's range cannot come from a real
		// book, so it is treated the same as absent rather than wrapped.
		var publishYear any
		if b.PublicationYear.Valid && b.PublicationYear.Int64 >= math.MinInt32 && b.PublicationYear.Int64 <= math.MaxInt32 {
			publishYear = int32(b.PublicationYear.Int64) //nolint:gosec // range-checked above
		}

		var existingID uuid.UUID
		var found bool
		var err error
		if isbn != "" {
			existingID, found, err = st.selectID(ctx, `select id from library_titles where tenant_id = $1 and isbn = $2`, tenantID, isbn)
		} else {
			existingID, found, err = st.selectID(ctx,
				`select id from library_titles where tenant_id = $1 and title = $2 and author = $3`,
				tenantID, mapping.CleanName(b.Title), mapping.CleanName(b.Author))
		}
		if err != nil {
			stat.RecordFailure(fmt.Sprintf("%d", b.ID), fmt.Sprintf("lookup library title: %v", err))
			continue
		}

		if found {
			if err := st.execRow(ctx,
				`update library_titles set title = $1, author = $2, publisher = $3, publish_year = $4, classification = $5 where id = $6`,
				mapping.CleanName(b.Title), mapping.CleanName(b.Author), mapping.CleanName(b.Publisher.String), publishYear, mapping.CleanName(b.Category.String), existingID,
			); err != nil {
				stat.RecordFailure(fmt.Sprintf("%d", b.ID), fmt.Sprintf("update library title: %v", err))
				continue
			}
			stat.Updated++
			result[b.ID] = existingID
			continue
		}

		var id uuid.UUID
		err = st.withRowSavepoint(ctx, func() error {
			return st.tx.QueryRow(ctx,
				`insert into library_titles (tenant_id, title, author, publisher, publish_year, isbn, classification)
				 values ($1, $2, $3, $4, $5, $6, $7)
				 returning id`,
				tenantID, mapping.CleanName(b.Title), mapping.CleanName(b.Author), mapping.CleanName(b.Publisher.String),
				publishYear, isbn, mapping.CleanName(b.Category.String),
			).Scan(&id)
		})
		if err != nil {
			stat.RecordFailure(fmt.Sprintf("%d", b.ID), fmt.Sprintf("create library title: %v", err))
			continue
		}
		stat.Created++
		result[b.ID] = id
	}
	return result, nil
}

// libraryCopyIndex resolves a source (book_id, book_loans.book_code) pair
// to the target library_copies.id created for it -- built by
// migrateLibraryCopies, consumed by migrateBookLoans.
type libraryCopyIndex map[int64]map[string]uuid.UUID

// migrateLibraryCopies reconstructs individually tracked copies from each
// book's aggregate stock count plus its book_loans.book_code history: the
// live schema has no per-copy table at all. For each book, the number of
// copies created is max(stock, distinct historical codes) -- stock can
// undercount when copies were later lost or withdrawn without the stock
// column being adjusted, evidenced by more distinct codes having
// circulated than the book currently lists in stock. The first len(codes)
// copies take their real historical code as barcode (deduplicated tenant-
// wide, since 49 codes in this school's data were reused across more than
// one book -- a source data-entry slip, not a real shared copy); any
// remaining copies needed to reach the stock count get a synthesized
// barcode. Copies are select-then-inserted on (tenant_id, barcode).
func (st *Store) migrateLibraryCopies(
	ctx context.Context, tenantID uuid.UUID, books []SionBook, titles IDMap, loanCodesByBook map[int64][]string, stat *TableStat,
) (libraryCopyIndex, error) {
	index := make(libraryCopyIndex, len(books))
	usedBarcodes := make(map[string]bool)
	stockUndercounted := 0

	for _, b := range books {
		titleID, ok := titles[b.ID]
		if !ok {
			continue // already recorded as a failure by migrateLibraryTitles
		}
		codes := loanCodesByBook[b.ID]
		copiesNeeded := b.Stock
		if len(codes) > copiesNeeded {
			copiesNeeded = len(codes)
			stockUndercounted++
		}

		byCode := make(map[string]uuid.UUID, copiesNeeded)
		for i := 0; i < copiesNeeded; i++ {
			var sourceCode string
			barcode := fmt.Sprintf("SION-%d-%03d", b.ID, i+1)
			if i < len(codes) {
				sourceCode = codes[i]
				if !usedBarcodes[sourceCode] {
					barcode = sourceCode
				}
			}
			usedBarcodes[barcode] = true

			copyID, created, err := st.upsertOne(ctx,
				`insert into library_copies (tenant_id, title_id, barcode)
				 values ($1, $2, $3)
				 on conflict (tenant_id, barcode) do update set title_id = excluded.title_id
				 returning id, (xmax = 0)`,
				tenantID, titleID, barcode,
			)
			if err != nil {
				stat.RecordFailure(fmt.Sprintf("%d/%d", b.ID, i+1), fmt.Sprintf("upsert library copy: %v", err))
				continue
			}
			stat.Read++
			if created {
				stat.Created++
			} else {
				stat.Updated++
			}
			if sourceCode != "" {
				byCode[sourceCode] = copyID
			}
		}
		index[b.ID] = byCode
	}
	if stockUndercounted > 0 {
		stat.RecordGap(fmt.Sprintf("books: %d title(s) had more distinct historical loan codes than their current stock count; copy count for those titles was raised to match the loan history instead of the (apparently stale) stock value", stockUndercounted))
	}
	return index, nil
}

// bookLoanStatus maps a live-schema book_loans.status to the target's
// library_loans.status. 'overdue' has no separate target status -- the
// target computes lateness from due_on instead of storing it -- so it
// folds into 'active', which is what it still is.
func bookLoanStatus(raw string) string {
	if raw == "returned" {
		return "returned"
	}
	return "active"
}

// migrateBookLoans migrates book_loans to library_loans. The source lets a
// copy accumulate more than one 'active' loan over time (357 (book_id,
// book_code) groups in this school's data) -- a data-entry gap, since the
// target enforces at most one active loan per copy. Only the
// highest-id 'active' loan in each such group is kept active; earlier ones
// in the same group are migrated as 'returned' (the copy could not
// otherwise have been lent out again) and counted as a gap rather than
// guessed at further.
// mappings from the legacy MySQL schema to the new Postgres schema; each
// branch handles one nullable source column or one gap case, and is a
// one-time migration tool exercised by its own tests, not runtime API
// logic. Splitting it would only relocate the same linear mapping.
//
//nolint:gocyclo // ETL migration: a fixed, ordered sequence of per-row/per-column field
func (st *Store) migrateBookLoans(
	ctx context.Context, tenantID uuid.UUID, loans []SionBookLoan, titles IDMap, copies libraryCopyIndex,
	users map[int64]userMigrationResult, loc *time.Location, stat *TableStat,
) error {
	demoted := demoteDuplicateActiveLoans(loans)
	missingCopyCode := 0
	sameDayRepeat := 0

	for _, l := range loans {
		stat.Read++
		member, ok := users[l.StudentID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", l.ID), "student not migrated (see identity table failures)")
			continue
		}
		librarian, ok := users[l.LibrarianID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", l.ID), "librarian not migrated (see identity table failures)")
			continue
		}
		titleID, ok := titles[l.BookID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", l.ID), "book not migrated (see library_titles table failures)")
			continue
		}
		if !l.BookCode.Valid || l.BookCode.String == "" {
			missingCopyCode++
			stat.RecordFailure(fmt.Sprintf("%d", l.ID), "no book_code recorded in source, cannot identify which copy this loan was for")
			continue
		}
		copyID, ok := copies[l.BookID][l.BookCode.String]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", l.ID), "copy not migrated (see library_copies table failures)")
			continue
		}

		status := bookLoanStatus(l.Status)
		if demoted[l.ID] {
			status = "returned"
		}

		var checkedInBy uuid.NullUUID
		if l.ReturnHandledBy.Valid {
			if user, ok := users[l.ReturnHandledBy.Int64]; ok {
				checkedInBy = uuid.NullUUID{UUID: user.targetUserID, Valid: true}
			}
		}
		var returnedAt any
		if l.ReturnDate.Valid {
			returnedAt = mapping.LocalToUTC(l.ReturnDate.Time, loc)
		}

		borrowedAt := mapping.LocalToUTC(l.LoanDate, loc)
		existingID, found, err := st.selectID(ctx,
			`select id from library_loans where tenant_id = $1 and copy_id = $2 and member_user_id = $3 and borrowed_at = $4`,
			tenantID, copyID, member.targetUserID, borrowedAt,
		)
		if err != nil {
			stat.RecordFailure(fmt.Sprintf("%d", l.ID), fmt.Sprintf("lookup library loan: %v", err))
			continue
		}
		if found {
			// Same (copy, member, day) as an already-migrated row -- the
			// source has 311 such groups, almost all same-day re-issues of
			// the same book to the same student recorded as a second
			// book_loans row. There is no column to distinguish that from
			// an accidental duplicate submission, so the later row updates
			// the first instead of creating a second loan for a book that,
			// per the source's own data, never left the student's hands.
			sameDayRepeat++
			if err := st.execRow(ctx,
				`update library_loans set status = $1, returned_at = $2, checked_in_by = $3, due_on = $4 where id = $5`,
				status, returnedAt, checkedInBy, mapping.LocalDate(l.DueDate), existingID,
			); err != nil {
				stat.RecordFailure(fmt.Sprintf("%d", l.ID), fmt.Sprintf("update library loan: %v", err))
				continue
			}
			stat.Updated++
			continue
		}

		if err := st.execRow(ctx,
			`insert into library_loans (
			   tenant_id, copy_id, title_id, member_user_id, checked_out_by, borrowed_at, due_on,
			   returned_at, checked_in_by, status
			 ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
			tenantID, copyID, titleID, member.targetUserID, librarian.targetUserID, borrowedAt, mapping.LocalDate(l.DueDate),
			returnedAt, checkedInBy, status,
		); err != nil {
			stat.RecordFailure(fmt.Sprintf("%d", l.ID), fmt.Sprintf("create library loan: %v", err))
			continue
		}
		stat.Created++
	}

	if n := len(demoted); n > 0 {
		stat.RecordGap(fmt.Sprintf("book_loans: %d row(s) shared a copy with a later 'active' loan for the same book_code; migrated as 'returned' instead, since the target allows at most one active loan per copy", n))
	}
	if sameDayRepeat > 0 {
		stat.RecordGap(fmt.Sprintf("book_loans: %d row(s) repeated an already-migrated (copy, member, day); the later source row updated the same target loan instead of creating a second one", sameDayRepeat))
	}
	if missingCopyCode > 0 {
		stat.RecordGap(fmt.Sprintf("book_loans: %d row(s) had no book_code recorded and could not be matched to a copy", missingCopyCode))
	}

	// A copy's status follows whether it now has an active loan in the
	// target -- computed once here instead of touched per loan row above,
	// since the same copy can appear in more than one processed loan.
	if _, err := st.tx.Exec(ctx,
		`update library_copies set status = 'on_loan'
		 where tenant_id = $1 and status <> 'on_loan' and id in (
		   select copy_id from library_loans where tenant_id = $1 and status = 'active'
		 )`,
		tenantID,
	); err != nil {
		return fmt.Errorf("sync copy status to active loans: %w", err)
	}
	return nil
}

// demoteDuplicateActiveLoans returns the set of source loan ids that must
// be migrated as 'returned' even though the source marks them 'active',
// because a later loan for the same (book_id, book_code) is also 'active'
// -- see migrateBookLoans' doc comment.
func demoteDuplicateActiveLoans(loans []SionBookLoan) map[int64]bool {
	type key struct {
		bookID int64
		code   string
	}
	latestActive := make(map[key]int64)
	for _, l := range loans {
		if l.Status != "active" || !l.BookCode.Valid || l.BookCode.String == "" {
			continue
		}
		k := key{l.BookID, l.BookCode.String}
		if l.ID > latestActive[k] {
			latestActive[k] = l.ID
		}
	}
	demoted := make(map[int64]bool)
	for _, l := range loans {
		if l.Status != "active" || !l.BookCode.Valid || l.BookCode.String == "" {
			continue
		}
		k := key{l.BookID, l.BookCode.String}
		if latestActive[k] != l.ID {
			demoted[l.ID] = true
		}
	}
	return demoted
}

// migrateLibraryVisits migrates library_visits, keyed by select-then-insert
// on (tenant_id, member_user_id, visited_at, purpose) since the target has
// no unique constraint of its own. kind is always 'member': the live
// schema only ever logs a known user's visit, never a guest.
func (st *Store) migrateLibraryVisits(ctx context.Context, tenantID uuid.UUID, visits []SionLibraryVisit, users map[int64]userMigrationResult, loc *time.Location, stat *TableStat) error {
	exactDuplicates := 0
	for _, v := range visits {
		stat.Read++
		member, ok := users[v.UserID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", v.ID), "user not migrated (see identity table failures)")
			continue
		}
		purpose := mapping.Truncate(mapping.CleanName(v.Purpose), 200)
		visitedAt := mapping.LocalToUTC(v.CreatedAt, loc)

		_, found, err := st.selectID(ctx,
			`select id from library_visits where tenant_id = $1 and member_user_id = $2 and visited_at = $3 and purpose = $4`,
			tenantID, member.targetUserID, visitedAt, purpose,
		)
		if err != nil {
			stat.RecordFailure(fmt.Sprintf("%d", v.ID), fmt.Sprintf("lookup library visit: %v", err))
			continue
		}
		if found {
			exactDuplicates++
			stat.Skipped++
			continue
		}

		if err := st.execRow(ctx,
			`insert into library_visits (tenant_id, member_user_id, kind, purpose, visited_at)
			 values ($1, $2, 'member', $3, $4)`,
			tenantID, member.targetUserID, purpose, visitedAt,
		); err != nil {
			stat.RecordFailure(fmt.Sprintf("%d", v.ID), fmt.Sprintf("create library visit: %v", err))
			continue
		}
		stat.Created++
	}
	if exactDuplicates > 0 {
		stat.RecordGap(fmt.Sprintf("library_visits: %d row(s) exactly repeated an already-migrated (member, timestamp, purpose); collapsed into that one visit", exactDuplicates))
	}
	return nil
}

// recordLibrarySettingsGap notes library_settings, which is not migrated to
// any target table -- the target's own library_policies (versioned JSON
// config) covers similar ground but this ETL does not attempt to translate
// the source's flat key/value pairs into that shape, since the values are
// a school policy decision, not raw data. settings is listed in the report
// so the school knows what its old configuration was when setting the new
// one up.
func recordLibrarySettingsGap(settings []LibrarySetting, stat *TableStat) {
	stat.Read = len(settings)
	if len(settings) == 0 {
		return
	}
	keys := make([]string, 0, len(settings))
	values := make(map[string]string, len(settings))
	for _, s := range settings {
		keys = append(keys, s.Key)
		values[s.Key] = s.Value.String
	}
	sort.Strings(keys)
	for _, k := range keys {
		stat.RecordGap(fmt.Sprintf("%s = %s (not migrated -- no direct target equivalent; configure library_policies manually if still wanted)", k, values[k]))
	}
}
