package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"sort"
	"time"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

// TableStat is the difference report's per-table row: how many source rows
// were read, and what happened to each on the target side. A re-run against
// an unchanged source should show read == skipped and zero created/updated.
type TableStat struct {
	Table    string      `json:"table"`
	Read     int         `json:"read"`
	Created  int         `json:"created"`
	Updated  int         `json:"updated"`
	Skipped  int         `json:"skipped"`
	Failed   int         `json:"failed"`
	Failures []FailedRow `json:"failures,omitempty"`
	Gaps     []string    `json:"gaps,omitempty"`
}

// FailedRow names one source row the ETL could not migrate and why, without
// ever including a secret (password, token) in the reason.
type FailedRow struct {
	SourceKey string `json:"source_key"`
	Reason    string `json:"reason"`
}

// Report is the ETL's output: one run against one tenant and one SION
// academic year, dry-run or not.
type Report struct {
	StartedAt  time.Time             `json:"started_at"`
	FinishedAt time.Time             `json:"finished_at"`
	TenantSlug string                `json:"tenant_slug"`
	SourceYear string                `json:"source_year"`
	DryRun     bool                  `json:"dry_run"`
	Tables     map[string]*TableStat `json:"tables"`
	order      []string
	clock      clock.Clock
}

// NewReport starts a report using clk for its timestamps, so a test can
// inject a Frozen clock instead of the ETL calling time.Now() itself.
func NewReport(clk clock.Clock, tenantSlug, sourceYear string, dryRun bool) *Report {
	return &Report{
		StartedAt:  clk.Now(),
		TenantSlug: tenantSlug,
		SourceYear: sourceYear,
		DryRun:     dryRun,
		Tables:     make(map[string]*TableStat),
		clock:      clk,
	}
}

// Table returns the mutable stat row for a table, creating it (and
// remembering it for stable print ordering) on first use.
func (r *Report) Table(name string) *TableStat {
	if s, ok := r.Tables[name]; ok {
		return s
	}
	s := &TableStat{Table: name}
	r.Tables[name] = s
	r.order = append(r.order, name)
	return s
}

// Finish stamps the finish time. Call it once, after every table has been
// processed.
func (r *Report) Finish() {
	r.FinishedAt = r.clock.Now()
}

// RecordFailure appends a failure to a table's stat and increments its
// failed count. reason must never contain a password, token, or hash.
func (s *TableStat) RecordFailure(sourceKey, reason string) {
	s.Failed++
	s.Failures = append(s.Failures, FailedRow{SourceKey: sourceKey, Reason: reason})
}

// RecordGap notes a source row or field this ETL deliberately did not
// migrate because the target schema has no equivalent, rather than
// inventing a value.
func (s *TableStat) RecordGap(description string) {
	s.Gaps = append(s.Gaps, description)
}

// WriteJSON writes the machine-readable report to path.
func (r *Report) WriteJSON(path string) error {
	f, err := os.Create(path) //nolint:gosec // operator-supplied report path, not user input
	if err != nil {
		return fmt.Errorf("create report file: %w", err)
	}
	defer func() { _ = f.Close() }()
	enc := json.NewEncoder(f)
	enc.SetIndent("", "  ")
	if err := enc.Encode(r); err != nil {
		return fmt.Errorf("encode report: %w", err)
	}
	return nil
}

// WriteHuman writes the stdout summary: one line per table plus totals.
func (r *Report) WriteHuman(w io.Writer) {
	mode := "apply"
	if r.DryRun {
		mode = "dry-run"
	}
	_, _ = fmt.Fprintf(w, "ETL run (%s) for tenant %q, SION year %s\n", mode, r.TenantSlug, r.SourceYear)
	_, _ = fmt.Fprintf(w, "started %s, finished %s\n\n", r.StartedAt.Format(time.RFC3339), r.FinishedAt.Format(time.RFC3339))

	names := make([]string, len(r.order))
	copy(names, r.order)
	sort.Strings(names)

	var totalRead, totalCreated, totalUpdated, totalSkipped, totalFailed int
	_, _ = fmt.Fprintf(w, "%-28s %8s %8s %8s %8s %8s\n", "table", "read", "created", "updated", "skipped", "failed")
	for _, name := range names {
		s := r.Tables[name]
		_, _ = fmt.Fprintf(w, "%-28s %8d %8d %8d %8d %8d\n", s.Table, s.Read, s.Created, s.Updated, s.Skipped, s.Failed)
		totalRead += s.Read
		totalCreated += s.Created
		totalUpdated += s.Updated
		totalSkipped += s.Skipped
		totalFailed += s.Failed
		for _, g := range s.Gaps {
			_, _ = fmt.Fprintf(w, "  gap: %s\n", g)
		}
		for _, f := range s.Failures {
			_, _ = fmt.Fprintf(w, "  failed: %s: %s\n", f.SourceKey, f.Reason)
		}
	}
	_, _ = fmt.Fprintf(w, "%-28s %8d %8d %8d %8d %8d\n", "total", totalRead, totalCreated, totalUpdated, totalSkipped, totalFailed)
}
