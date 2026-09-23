package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/visitors/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

// Recap is the security office's daily or monthly summary: how many
// visitors came, how many are still on campus at the end of the range, how
// long a stay runs on average, and incidents by severity.
type Recap struct {
	From, To       time.Time
	TotalVisits    int
	StillOnCampus  int
	AvgStayMinutes float64
	Incidents      map[domain.Severity]int
}

// DailyRecap covers the calendar day containing day, local to the server's
// UTC clock (every timestamp in this module is stored and compared in UTC).
func (s *Service) DailyRecap(ctx context.Context, tenantID uuid.UUID, day time.Time) (Recap, error) {
	from := time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, time.UTC)
	return s.recap(ctx, tenantID, from, from.AddDate(0, 0, 1))
}

// MonthlyRecap covers the calendar month containing day.
func (s *Service) MonthlyRecap(ctx context.Context, tenantID uuid.UUID, day time.Time) (Recap, error) {
	from := time.Date(day.Year(), day.Month(), 1, 0, 0, 0, 0, time.UTC)
	return s.recap(ctx, tenantID, from, from.AddDate(0, 1, 0))
}

func (s *Service) recap(ctx context.Context, tenantID uuid.UUID, from, to time.Time) (Recap, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return Recap{}, err
	}
	var (
		visitCounts    VisitRecapCounts
		incidentCounts map[domain.Severity]int
	)
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		if visitCounts, err = s.repo.VisitRecap(ctx, tenantID, from, to); err != nil {
			return err
		}
		incidentCounts, err = s.repo.IncidentSeverityCounts(ctx, tenantID, from, to)
		return err
	})
	if err != nil {
		return Recap{}, err
	}
	return Recap{
		From: from, To: to, TotalVisits: visitCounts.TotalVisits, StillOnCampus: visitCounts.StillOnCampus,
		AvgStayMinutes: visitCounts.AvgStayMinutes, Incidents: incidentCounts,
	}, nil
}

// recapColumns is the report's stable two-column shape: every recap
// figure (visit counts, incident counts by severity) is a label/value
// pair, matching the hand-written export's layout before this module
// moved onto reportdoc.
func recapColumns() []reportdoc.Column {
	return []reportdoc.Column{
		{Key: "label", Label: "Keterangan", Kind: reportdoc.ColumnText, Width: 30},
		{Key: "value", Label: "Jumlah", Kind: reportdoc.ColumnNumber, Width: 14},
	}
}

// severityOrder is the fixed display order every recap export uses for
// its incident breakdown, low to critical.
var severityOrder = []domain.Severity{domain.SeverityLow, domain.SeverityMedium, domain.SeverityHigh, domain.SeverityCritical}

// buildRecapDocument assembles the reportdoc.Document title renders as a
// two-section report: overall figures, then incidents by severity.
func buildRecapDocument(title string, r Recap) reportdoc.Document {
	summaryRows := [][]any{
		{"Total kunjungan", r.TotalVisits},
		{"Masih di kampus", r.StillOnCampus},
		{"Rata-rata durasi (menit)", r.AvgStayMinutes},
	}
	incidentRows := make([][]any, len(severityOrder))
	for i, sev := range severityOrder {
		incidentRows[i] = []any{string(sev), r.Incidents[sev]}
	}
	return reportdoc.Document{
		Title: title,
		Scope: []reportdoc.ScopeLine{
			{Label: "Periode", Value: r.From.Format("2006-01-02") + " s.d. " + r.To.AddDate(0, 0, -1).Format("2006-01-02")},
		},
		Columns: recapColumns(),
		Sections: []reportdoc.Section{
			{Name: "Ringkasan", Rows: summaryRows},
			{Name: "Insiden per Tingkat Keparahan", Rows: incidentRows},
		},
	}
}

// ExportRecapReport renders a Recap per opts (format, title override,
// letterhead visibility, column subset/order). Letterhead is always nil
// today: no tenant report-header reader is wired into this module yet, so
// opts.ShowLetterhead has no visible effect until one is (see
// apps/api/internal/platform/reportdoc's package comment for that
// follow-up).
func ExportRecapReport(title string, r Recap, opts reportdoc.Options) ([]byte, error) {
	doc, err := reportdoc.Apply(buildRecapDocument(title, r), opts)
	if err != nil {
		return nil, err
	}
	if opts.Format == reportdoc.FormatPDF {
		return reportdoc.RenderPDF(doc)
	}
	return reportdoc.RenderXLSX(doc)
}
