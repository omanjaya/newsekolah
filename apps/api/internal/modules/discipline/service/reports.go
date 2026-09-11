package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/documents"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/storage"
)

// StudentReportPDF renders one student's individual discipline report --
// violations table with reporter names, total points, signature block --
// matching the old app's per-student DOCX (violation_reports.go:259-281).
// Like CounselingReportPDF, this goes through the documents renderer
// directly rather than permits' numbered-document pipeline: it is an
// internal report, not an issued legal document.
func (s *Service) StudentReportPDF(ctx context.Context, tenantID, studentID uuid.UUID) (string, error) {
	if s.renderer == nil || s.storage == nil {
		return "", domain.ErrReportUnavailable
	}
	summary, err := s.StudentSummary(ctx, tenantID, studentID)
	if err != nil {
		return "", err
	}

	reporterIDs := make([]uuid.UUID, 0, len(summary.Records))
	seen := make(map[uuid.UUID]bool, len(summary.Records))
	for _, r := range summary.Records {
		if !seen[r.ReporterUserID] {
			seen[r.ReporterUserID] = true
			reporterIDs = append(reporterIDs, r.ReporterUserID)
		}
	}
	reporterNames := map[uuid.UUID]string{}
	if s.names != nil && len(reporterIDs) > 0 {
		if names, err := s.names.Names(ctx, tenantID, reporterIDs); err == nil {
			reporterNames = names
		}
	}

	rows := make([]map[string]any, 0, len(summary.Records))
	for _, r := range summary.Records {
		if r.IsVoided() {
			continue
		}
		rows = append(rows, map[string]any{
			"date": r.OccurredOn.Format("02-01-2006"), "name": r.TypeName, "points": r.PointsSnapshot,
			"reporter": reporterNames[r.ReporterUserID],
		})
	}

	var yearID uuid.UUID
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		yearID, err = s.activeYear(ctx, tenantID)
		return err
	})
	if err != nil {
		return "", err
	}
	student, err := s.repo.StudentSnapshot(ctx, tenantID, studentID, yearID)
	if err != nil {
		return "", err
	}

	rendered, err := s.renderer.Render(ctx, documents.Template{Engine: documents.EngineHTML, Body: BuiltinStudentReportHTML}, map[string]any{
		"student_name": student.StudentName, "nis": student.NIS, "class_name": student.ClassName,
		"total_points": summary.TotalPoints, "violations": rows,
	})
	if err != nil {
		return "", fmt.Errorf("render student discipline report: %w", err)
	}
	objectKey := fmt.Sprintf("tenants/%s/discipline/students/%s/report.pdf", tenantID, studentID)
	if err := s.storage.PutObject(ctx, objectKey, rendered.PDF, "application/pdf"); err != nil {
		return "", fmt.Errorf("store student discipline report: %w", err)
	}
	u, err := s.storage.PresignedGetURL(ctx, objectKey, storage.DefaultUploadURLTTL)
	if err != nil {
		return "", fmt.Errorf("presign student discipline report: %w", err)
	}
	return u.String(), nil
}

// BuiltinStudentReportHTML is the individual student report: a violations
// table with reporter names, the running total, and a Guru BK signature
// (the old app's DOCX equivalent, violation_reports.go:259-281).
const BuiltinStudentReportHTML = `<html><body style="font-family: serif; font-size: 12pt; margin: 40px;">
<h2 style="text-align:center;">REKAP PELANGGARAN SISWA</h2>
<table>
<tr><td>Nama</td><td>: {{.student_name}}</td></tr>
<tr><td>NIS</td><td>: {{.nis}}</td></tr>
<tr><td>Kelas</td><td>: {{.class_name}}</td></tr>
</table>
<table border="1" cellpadding="4" cellspacing="0" style="width:100%; margin-top:16px;">
<tr><th>Tanggal</th><th>Pelanggaran</th><th>Poin</th><th>Pencatat</th></tr>
{{range .violations}}<tr><td>{{.date}}</td><td>{{.name}}</td><td>{{.points}}</td><td>{{.reporter}}</td></tr>{{end}}
</table>
<p style="margin-top:16px;"><strong>Total Poin: {{.total_points}}</strong></p>
<table style="width:100%; margin-top:60px; text-align:center;">
<tr><td>Guru BK</td></tr>
<tr><td style="padding-top:70px;">(....................)</td></tr>
</table>
</body></html>`
