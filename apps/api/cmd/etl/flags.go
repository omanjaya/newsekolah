package main

import "flag"

// etlFlags is a thin wrapper so config.go can parse a flag.FlagSet without
// scattering flag.String calls across loadConfig.
type etlFlags struct {
	set            *flag.FlagSet
	sourceDSN      string
	targetDSN      string
	tenantSlug     string
	sourceYear     string
	sourceSemester string
	reportPath     string
	dryRun         bool
}

func newFlagSet() *etlFlags {
	f := &etlFlags{set: flag.NewFlagSet("etl", flag.ContinueOnError)}
	f.set.StringVar(&f.sourceDSN, "source-dsn", "", "SION MySQL DSN, e.g. user:pass@tcp(host:3306)/sion")
	f.set.StringVar(&f.targetDSN, "target-dsn", "", "target Postgres DSN (defaults to DATABASE_URL)")
	f.set.StringVar(&f.tenantSlug, "tenant", "", "target tenant slug to migrate into")
	f.set.StringVar(&f.sourceYear, "source-year", "", `SION academic_years.year_label to migrate, e.g. "2026/2027"`)
	f.set.StringVar(&f.sourceSemester, "source-semester", "", "SION semester to migrate: ganjil or genap")
	f.set.StringVar(&f.reportPath, "report", "", "path to write the JSON difference report (default etl-report.json)")
	f.set.BoolVar(&f.dryRun, "dry-run", false, "do everything except write to the target database")
	return f
}
