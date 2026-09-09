package main

import (
	"fmt"
	"os"
	"strings"
)

// Config holds everything the ETL needs to connect to the source SION
// database and the target tenant, resolved from flags first and the
// process environment second. It fails fast on anything missing, mirroring
// apps/api/internal/platform/config's contract: one aggregated error naming
// every missing setting, not a chain of one-at-a-time failures.
type Config struct {
	SourceMySQLDSN string
	TargetDatabase string
	TenantSlug     string
	SourceYear     string // SION academic_years.year_label, e.g. "2026/2027"
	SourceSemester string // "ganjil" or "genap"
	ReportPath     string
	DryRun         bool
}

// loadConfig parses flags, falling back to environment variables for any
// flag left at its zero value. No other function in this command reads
// os.Getenv or the flag package directly.
func loadConfig(args []string) (Config, error) {
	fs := newFlagSet()
	if err := fs.set.Parse(args); err != nil {
		return Config{}, err
	}

	c := Config{
		SourceMySQLDSN: firstNonEmpty(fs.sourceDSN, os.Getenv("ETL_SOURCE_MYSQL_DSN")),
		TargetDatabase: firstNonEmpty(fs.targetDSN, os.Getenv("DATABASE_URL")),
		TenantSlug:     firstNonEmpty(fs.tenantSlug, os.Getenv("ETL_TENANT_SLUG")),
		SourceYear:     firstNonEmpty(fs.sourceYear, os.Getenv("ETL_SOURCE_YEAR")),
		SourceSemester: strings.ToLower(firstNonEmpty(fs.sourceSemester, os.Getenv("ETL_SOURCE_SEMESTER"))),
		ReportPath:     firstNonEmpty(fs.reportPath, os.Getenv("ETL_REPORT_PATH"), "etl-report.json"),
		DryRun:         fs.dryRun,
	}

	var missing []string
	if c.SourceMySQLDSN == "" {
		missing = append(missing, "--source-dsn / ETL_SOURCE_MYSQL_DSN")
	}
	if c.TargetDatabase == "" {
		missing = append(missing, "--target-dsn / DATABASE_URL")
	}
	if c.TenantSlug == "" {
		missing = append(missing, "--tenant / ETL_TENANT_SLUG")
	}
	if c.SourceYear == "" {
		missing = append(missing, "--source-year / ETL_SOURCE_YEAR")
	}
	if c.SourceSemester != "ganjil" && c.SourceSemester != "genap" {
		missing = append(missing, "--source-semester / ETL_SOURCE_SEMESTER (must be ganjil or genap)")
	}
	if len(missing) > 0 {
		return Config{}, fmt.Errorf("etl: missing or invalid configuration: %s", strings.Join(missing, ", "))
	}
	return c, nil
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}
