package main

import (
	"database/sql"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/omanjaya/newsekolah/apps/api/cmd/etl/mapping"
)

// nullText converts a database/sql.NullString (from the MySQL source) to
// pgtype.Text (for the Postgres target), collapsing an all-whitespace value
// to NULL rather than writing an empty string.
func nullText(v sql.NullString) pgtype.Text {
	if !v.Valid {
		return pgtype.Text{}
	}
	cleaned := mapping.CleanName(v.String)
	if cleaned == "" {
		return pgtype.Text{}
	}
	return pgtype.Text{String: cleaned, Valid: true}
}

// nullYear converts a source year column to pgtype.Int2, the smallint the
// target schema's *_profiles.joined_year / entry_year columns use. A year
// value outside int16's range cannot come from a real calendar year, so it
// is treated the same as absent rather than wrapped or truncated.
func nullYear(v sql.NullInt64) pgtype.Int2 {
	if !v.Valid || v.Int64 < -32768 || v.Int64 > 32767 {
		return pgtype.Int2{}
	}
	return pgtype.Int2{Int16: int16(v.Int64), Valid: true} //nolint:gosec // range-checked above
}

// toSequence converts a source sort-order column (MySQL INT) to the int16
// the target schema's sequence columns use. SION periods and grade levels
// never realistically exceed a few dozen, so an out-of-range value is
// clamped to int16's maximum rather than wrapped.
func toSequence(n int) int16 {
	const maxInt16 = 1<<15 - 1
	if n > maxInt16 {
		return maxInt16
	}
	if n < 0 {
		return 0
	}
	return int16(n) //nolint:gosec // range-checked above
}

// nullDate converts a source DATE/DATETIME column to pgtype.Date, dropping
// any time-of-day component: birth_date and similar columns are calendar
// dates, not instants, so no timezone reinterpretation applies (compare
// mapping.LocalToUTC, used for real timestamps).
func nullDate(v sql.NullTime) pgtype.Date {
	if !v.Valid {
		return pgtype.Date{}
	}
	return pgtype.Date{Time: v.Time, Valid: true}
}
