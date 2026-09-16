package main

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	_ "github.com/go-sql-driver/mysql" // registers the "mysql" database/sql driver
)

// Source wraps the live SION MySQL connection. Every query lives in one of
// the source_*.go files, grouped the same way the target's modules are.
type Source struct {
	db *sql.DB
}

// openSource connects to the SION MySQL database. parseTime=true and
// loc=UTC ensure DATE/DATETIME/TIMESTAMP columns arrive as naive
// time.Time values labelled UTC, so mapping.LocalToUTC can reinterpret them
// against the tenant's real timezone without the driver already having
// shifted them once.
func openSource(dsn string) (*Source, error) {
	full := dsn
	if !dsnHasParseTime(dsn) {
		full += dsnSeparator(dsn) + "parseTime=true&loc=UTC"
	}
	db, err := sql.Open("mysql", full)
	if err != nil {
		return nil, fmt.Errorf("open source mysql: %w", err)
	}
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("ping source mysql: %w", err)
	}
	return &Source{db: db}, nil
}

func (s *Source) Close() error { return s.db.Close() }

func dsnHasParseTime(dsn string) bool {
	return strings.Contains(dsn, "parseTime=")
}

func dsnSeparator(dsn string) string {
	if strings.Contains(dsn, "?") {
		return "&"
	}
	return "?"
}

// resolveYearID looks up the live schema's years row identified by
// (start_year, semester), validating that its end_year is the expected
// start_year+1 -- the same "YYYY/YYYY spans consecutive years" contract the
// operator-facing --source-year flag has always had.
func (s *Source) resolveYearID(startYear, endYear, semester int) (int64, error) {
	var id int64
	var gotEndYear int
	err := s.db.QueryRow(
		`select id, end_year from years where start_year = ? and semester = ?`,
		startYear, semester,
	).Scan(&id, &gotEndYear)
	if err != nil {
		return 0, fmt.Errorf("resolve year %d/%d semester %d: %w", startYear, endYear, semester, err)
	}
	if gotEndYear != endYear {
		return 0, fmt.Errorf("year %d/%d semester %d: source end_year is %d, not %d", startYear, endYear, semester, gotEndYear, endYear)
	}
	return id, nil
}

// FetchYearDates reads the resolved years row's own start_date/end_date, so
// the target academic year and term can be created with real dates instead
// of mapping.AcademicYearDates' July-to-June guess.
func (s *Source) FetchYearDates(yearID int64) (startDate, endDate time.Time, err error) {
	err = s.db.QueryRow(`select start_date, end_date from years where id = ?`, yearID).Scan(&startDate, &endDate)
	return startDate, endDate, err
}
