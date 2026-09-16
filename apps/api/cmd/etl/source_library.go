package main

import (
	"database/sql"
	"time"
)

// SionBook is one live-schema books row: a title, with an aggregate stock
// count rather than individually tracked copies (the live schema has no
// per-copy table -- see migrate_library.go for how copies are
// reconstructed from stock plus book_loans.book_code history).
type SionBook struct {
	ID              int64
	Title           string
	ISBN            sql.NullString
	Author          string
	Publisher       sql.NullString
	PublicationYear sql.NullInt64
	Category        sql.NullString
	Stock           int
}

func (s *Source) FetchBooks() ([]SionBook, error) {
	rows, err := s.db.Query(
		`select id, title, isbn, author, publisher, publication_year, category, stock
		 from books where deleted_at is null order by id`,
	)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []SionBook
	for rows.Next() {
		var b SionBook
		if err := rows.Scan(&b.ID, &b.Title, &b.ISBN, &b.Author, &b.Publisher, &b.PublicationYear, &b.Category, &b.Stock); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

// FetchBookLoanCodesByBook reads, for every book, the distinct book_code
// values its book_loans history used, in first-seen order (lowest loan id
// first). migrate_library.go assigns these as real copies' barcodes before
// synthesizing any further copies needed to reach the book's stock count,
// so a copy that has loan history keeps its real, recognisable code.
func (s *Source) FetchBookLoanCodesByBook() (map[int64][]string, error) {
	rows, err := s.db.Query(
		`select book_id, book_code
		 from (
		   select book_id, book_code, min(id) as first_id
		   from book_loans
		   where book_code is not null and book_code <> ''
		   group by book_id, book_code
		 ) codes
		 order by book_id, first_id`,
	)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	out := make(map[int64][]string)
	for rows.Next() {
		var bookID int64
		var code string
		if err := rows.Scan(&bookID, &code); err != nil {
			return nil, err
		}
		out[bookID] = append(out[bookID], code)
	}
	return out, rows.Err()
}

// SionBookLoan is one live-schema book_loans row.
type SionBookLoan struct {
	ID              int64
	StudentID       int64
	BookID          int64
	LibrarianID     int64
	LoanDate        time.Time
	DueDate         time.Time
	ReturnDate      sql.NullTime
	Status          string
	ReturnHandledBy sql.NullInt64
	Notes           sql.NullString
	BookCode        sql.NullString
}

// FetchBookLoans reads every book_loans row.
func (s *Source) FetchBookLoans() ([]SionBookLoan, error) {
	rows, err := s.db.Query(
		`select id, user_id, book_id, librarian_id, loan_date, due_date, return_date,
		        status, return_handled_by, notes, book_code
		 from book_loans order by id`,
	)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []SionBookLoan
	for rows.Next() {
		var l SionBookLoan
		if err := rows.Scan(
			&l.ID, &l.StudentID, &l.BookID, &l.LibrarianID, &l.LoanDate, &l.DueDate, &l.ReturnDate,
			&l.Status, &l.ReturnHandledBy, &l.Notes, &l.BookCode,
		); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// SionLibraryVisit is one live-schema library_visits row: a logged visit to
// the library by a known user (the live schema has no guest/non-member
// visit tracking, unlike the target's library_visits.kind).
type SionLibraryVisit struct {
	ID        int64
	UserID    int64
	Purpose   string
	Notes     sql.NullString
	CreatedAt time.Time
}

func (s *Source) FetchLibraryVisits() ([]SionLibraryVisit, error) {
	rows, err := s.db.Query(`select id, user_id, purpose, notes, created_at from library_visits order by id`)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []SionLibraryVisit
	for rows.Next() {
		var v SionLibraryVisit
		if err := rows.Scan(&v.ID, &v.UserID, &v.Purpose, &v.Notes, &v.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// LibrarySetting is one live-schema library_settings row (key/value/type).
// Not migrated to any target table -- see docs/13-etl-sion.md -- fetched
// only so the report can tell an operator what the source had configured.
type LibrarySetting struct {
	Key   string
	Value sql.NullString
}

func (s *Source) FetchLibrarySettings() ([]LibrarySetting, error) {
	rows, err := s.db.Query("select `key`, value from library_settings order by `key`")
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []LibrarySetting
	for rows.Next() {
		var st LibrarySetting
		if err := rows.Scan(&st.Key, &st.Value); err != nil {
			return nil, err
		}
		out = append(out, st)
	}
	return out, rows.Err()
}
