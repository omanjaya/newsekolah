package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/supervision/domain"
)

// TeacherCycleReport is one teacher's observations within one cycle,
// averaged per criterion and overall.
type TeacherCycleReport struct {
	TeacherUserID  uuid.UUID
	TeacherName    string
	Cycle          domain.SupervisionCycle
	Observations   []domain.Observation
	OverallAverage float64
	CriterionAvg   map[string]float64
}

func (s *Service) TeacherReport(ctx context.Context, tenantID, cycleID, teacherUserID uuid.UUID) (TeacherCycleReport, error) {
	var out TeacherCycleReport
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		cycle, ok, err := s.repo.GetCycle(ctx, tenantID, cycleID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrCycleNotFound
		}
		observations, err := s.repo.ListObservationsForTeacherCycle(ctx, tenantID, cycleID, teacherUserID)
		if err != nil {
			return err
		}
		name, err := s.repo.TeacherName(ctx, tenantID, teacherUserID)
		if err != nil {
			return err
		}
		out = buildTeacherCycleReport(teacherUserID, name, cycle, observations)
		return nil
	})
	return out, err
}

func buildTeacherCycleReport(teacherUserID uuid.UUID, teacherName string, cycle domain.SupervisionCycle, observations []domain.Observation) TeacherCycleReport {
	sums := make(map[string]int, len(cycle.Instrument.Criteria))
	counts := make(map[string]int, len(cycle.Instrument.Criteria))
	overallSum, overallCount := 0, 0
	for _, obs := range observations {
		for _, score := range obs.Scores {
			sums[score.CriterionKey] += score.Score
			counts[score.CriterionKey]++
			overallSum += score.Score
			overallCount++
		}
	}
	criterionAvg := make(map[string]float64, len(sums))
	for key, sum := range sums {
		if counts[key] > 0 {
			criterionAvg[key] = float64(sum) / float64(counts[key])
		}
	}
	overall := 0.0
	if overallCount > 0 {
		overall = float64(overallSum) / float64(overallCount)
	}
	return TeacherCycleReport{
		TeacherUserID: teacherUserID, TeacherName: teacherName, Cycle: cycle, Observations: observations,
		OverallAverage: overall, CriterionAvg: criterionAvg,
	}
}

// ExportTeacherReportXLSX renders a teacher's cycle report as a workbook,
// reusing the excelize dependency the reports module already depends on
// for report-centre exports.
func ExportTeacherReportXLSX(report TeacherCycleReport) ([]byte, error) {
	f := excelize.NewFile()
	defer f.Close() //nolint:errcheck // an in-memory workbook cannot fail to close after WriteToBuffer

	sheet := "Supervisi"
	if err := f.SetSheetName("Sheet1", sheet); err != nil {
		return nil, fmt.Errorf("rename sheet: %w", err)
	}

	headers := []string{"Tanggal Observasi"}
	for _, c := range report.Cycle.Instrument.Criteria {
		headers = append(headers, c.Name)
	}
	headers = append(headers, "Rata-rata", "Catatan Pengamat", "Tanggapan Guru", "Tindak Lanjut")
	for col, header := range headers {
		cell, err := excelize.CoordinatesToCellName(col+1, 1)
		if err != nil {
			return nil, fmt.Errorf("cell name: %w", err)
		}
		if err := f.SetCellValue(sheet, cell, header); err != nil {
			return nil, fmt.Errorf("write header: %w", err)
		}
	}

	for rowIdx, obs := range report.Observations {
		if err := writeObservationRow(f, sheet, rowIdx+2, report.Cycle.Instrument.Criteria, obs); err != nil {
			return nil, err
		}
	}

	buf, err := f.WriteToBuffer()
	if err != nil {
		return nil, fmt.Errorf("write workbook: %w", err)
	}
	return buf.Bytes(), nil
}

// writeObservationRow writes one observation's cells: the date, each
// criterion's score in the instrument's own order, the row average, and
// the three free-text fields.
func writeObservationRow(f *excelize.File, sheet string, row int, criteria []domain.Criterion, obs domain.Observation) error {
	byKey := make(map[string]int, len(obs.Scores))
	for _, score := range obs.Scores {
		byKey[score.CriterionKey] = score.Score
	}

	col := 1
	values := make([]any, 0, len(criteria)+5)
	values = append(values, obs.ObservedAt.Format("2006-01-02"))
	for _, c := range criteria {
		values = append(values, byKey[c.Key])
	}
	values = append(values, domain.Average(obs.Scores), obs.ObserverNotes, obs.TeacherResponse, obs.AgreedFollowUp)

	for _, v := range values {
		if err := setCell(f, sheet, col, row, v); err != nil {
			return err
		}
		col++
	}
	return nil
}

func setCell(f *excelize.File, sheet string, col, row int, value any) error {
	cell, err := excelize.CoordinatesToCellName(col, row)
	if err != nil {
		return fmt.Errorf("cell name: %w", err)
	}
	if err := f.SetCellValue(sheet, cell, value); err != nil {
		return fmt.Errorf("write cell: %w", err)
	}
	return nil
}
