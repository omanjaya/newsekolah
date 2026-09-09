package main

import (
	"database/sql"
	"fmt"
	"strings"

	_ "github.com/go-sql-driver/mysql" // registers the "mysql" database/sql driver
)

// Source wraps the SION MySQL connection. Every query lives in one of the
// source_*.go files, grouped the same way the target's modules are.
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

// resolveAcademicYearID looks up the SION academic_years row identified by
// its (year_label, semester) natural key -- SION's true unique constraint,
// see reference/sion/backend/migrations/002_academic_years.up.sql.
func (s *Source) resolveAcademicYearID(yearLabel, semester string) (string, error) {
	var id string
	err := s.db.QueryRow(
		`select id from academic_years where year_label = ? and semester = ?`,
		yearLabel, semester,
	).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("resolve SION academic year %s/%s: %w", yearLabel, semester, err)
	}
	return id, nil
}
