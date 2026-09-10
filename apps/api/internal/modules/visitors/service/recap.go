package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/visitors/domain"
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

// ExportRecapXLSX renders a Recap as a one-sheet workbook for the security
// office, using the same excelize dependency the reports module uses for
// its own exports.
func ExportRecapXLSX(title string, r Recap) ([]byte, error) {
	f := excelize.NewFile()
	defer f.Close() //nolint:errcheck // an in-memory workbook cannot fail to close after WriteToBuffer

	sheet := "Recap"
	if err := f.SetSheetName("Sheet1", sheet); err != nil {
		return nil, fmt.Errorf("rename sheet: %w", err)
	}
	rows := [][]any{
		{title},
		{"Periode", r.From.Format("2006-01-02"), "sampai", r.To.AddDate(0, 0, -1).Format("2006-01-02")},
		{},
		{"Total kunjungan", r.TotalVisits},
		{"Masih di kampus", r.StillOnCampus},
		{"Rata-rata durasi (menit)", r.AvgStayMinutes},
		{},
		{"Insiden per tingkat keparahan"},
	}
	for _, sev := range []domain.Severity{domain.SeverityLow, domain.SeverityMedium, domain.SeverityHigh, domain.SeverityCritical} {
		rows = append(rows, []any{string(sev), r.Incidents[sev]})
	}
	for i, row := range rows {
		for col, value := range row {
			cell, err := excelize.CoordinatesToCellName(col+1, i+1)
			if err != nil {
				return nil, fmt.Errorf("cell name: %w", err)
			}
			if err := f.SetCellValue(sheet, cell, value); err != nil {
				return nil, fmt.Errorf("write cell: %w", err)
			}
		}
	}
	buf, err := f.WriteToBuffer()
	if err != nil {
		return nil, fmt.Errorf("write workbook: %w", err)
	}
	return buf.Bytes(), nil
}
