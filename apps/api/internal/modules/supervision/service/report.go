package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/supervision/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
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

// teacherReportColumns is the report's stable column set: the observation
// date, one column per instrument criterion (a criterion's own Key,
// prefixed so it can never collide with the four fixed keys below), the
// per-observation average, and the three free-text fields.
func teacherReportColumns(criteria []domain.Criterion) []reportdoc.Column {
	columns := make([]reportdoc.Column, 0, len(criteria)+5)
	columns = append(columns, reportdoc.Column{Key: "date", Label: "Tanggal Observasi", Kind: reportdoc.ColumnDate, Width: 14})
	for _, c := range criteria {
		columns = append(columns, reportdoc.Column{Key: "criterion_" + c.Key, Label: c.Name, Kind: reportdoc.ColumnNumber, Width: 12})
	}
	columns = append(columns,
		reportdoc.Column{Key: "average", Label: "Rata-rata", Kind: reportdoc.ColumnNumber, Width: 10},
		reportdoc.Column{Key: "observer_notes", Label: "Catatan Pengamat", Kind: reportdoc.ColumnText, Width: 28},
		reportdoc.Column{Key: "teacher_response", Label: "Tanggapan Guru", Kind: reportdoc.ColumnText, Width: 28},
		reportdoc.Column{Key: "agreed_follow_up", Label: "Tindak Lanjut", Kind: reportdoc.ColumnText, Width: 28},
	)
	return columns
}

// teacherReportRow builds one observation's row, in the same column order
// teacherReportColumns declares.
func teacherReportRow(criteria []domain.Criterion, obs domain.Observation) []any {
	byKey := make(map[string]int, len(obs.Scores))
	for _, score := range obs.Scores {
		byKey[score.CriterionKey] = score.Score
	}
	row := make([]any, 0, len(criteria)+5)
	row = append(row, obs.ObservedAt)
	for _, c := range criteria {
		row = append(row, byKey[c.Key])
	}
	row = append(row, domain.Average(obs.Scores), obs.ObserverNotes, obs.TeacherResponse, obs.AgreedFollowUp)
	return row
}

// lastObserverName resolves the name of whoever conducted the most recent
// observation in the report -- the "Supervisor" signer on the formal PDF
// report, since a cycle keeps no single supervisor of its own (each
// observation names its own observer, and different observers may cover
// the same teacher across a cycle).
func (s *Service) lastObserverName(ctx context.Context, tenantID uuid.UUID, observations []domain.Observation) (string, error) {
	if len(observations) == 0 {
		return "", nil
	}
	last := observations[0]
	for _, obs := range observations[1:] {
		if obs.ObservedAt.After(last.ObservedAt) {
			last = obs
		}
	}
	return s.repo.TeacherName(ctx, tenantID, last.ObserverUserID)
}

// ExportTeacherReport renders a teacher's cycle report per opts (format,
// title override, letterhead visibility, column subset/order). The PDF
// format reads as a formal supervision report: a letterhead slot (see
// reportdoc's package comment -- no tenant report-header reader is wired
// into this module yet, so opts.ShowLetterhead has no visible effect
// until one is), the observation table, and a two-signer signature block
// for the supervisor who conducted the observations and the principal.
func (s *Service) ExportTeacherReport(ctx context.Context, tenantID, cycleID, teacherUserID uuid.UUID, opts reportdoc.Options) ([]byte, error) {
	report, err := s.TeacherReport(ctx, tenantID, cycleID, teacherUserID)
	if err != nil {
		return nil, err
	}
	supervisorName, err := s.lastObserverName(ctx, tenantID, report.Observations)
	if err != nil {
		return nil, err
	}

	doc := buildTeacherReportDocument(report, supervisorName, s.clock.Now())
	return renderReport(doc, opts)
}

// buildTeacherReportDocument assembles the reportdoc.Document
// ExportTeacherReport renders: the observation table (one column per
// instrument criterion, in the instrument's own order) and a two-signer
// signature block for the supervisor who conducted the observations and
// the principal. Kept separate from the database reads above so it can be
// unit tested without a fixture.
func buildTeacherReportDocument(report TeacherCycleReport, supervisorName string, now time.Time) reportdoc.Document {
	criteria := report.Cycle.Instrument.Criteria
	rows := make([][]any, len(report.Observations))
	for i, obs := range report.Observations {
		rows[i] = teacherReportRow(criteria, obs)
	}

	return reportdoc.Document{
		Title: "Laporan Supervisi Guru",
		Scope: []reportdoc.ScopeLine{
			{Label: "Siklus", Value: report.Cycle.Name},
			{Label: "Guru", Value: report.TeacherName},
		},
		Columns:  teacherReportColumns(criteria),
		Sections: []reportdoc.Section{{Name: report.TeacherName, Rows: rows}},
		Signature: &reportdoc.Signature{
			Date: now.Format("02-01-2006"),
			Signers: []reportdoc.Signer{
				{RoleLabel: "Supervisor", Name: supervisorName},
				{RoleLabel: "Kepala Sekolah"},
			},
		},
	}
}

// renderReport applies opts to doc and renders it in the format opts
// requests, defaulting to XLSX when the caller (or an old client that
// predates this query-param contract) did not name one.
func renderReport(doc reportdoc.Document, opts reportdoc.Options) ([]byte, error) {
	narrowed, err := reportdoc.Apply(doc, opts)
	if err != nil {
		return nil, err
	}
	if opts.Format == reportdoc.FormatPDF {
		return reportdoc.RenderPDF(narrowed)
	}
	return reportdoc.RenderXLSX(narrowed)
}
