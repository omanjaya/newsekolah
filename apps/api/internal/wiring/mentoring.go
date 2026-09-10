package wiring

import (
	"context"

	"github.com/google/uuid"

	attendanceservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	disciplineservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/service"
	gradingservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/service"
	mentoringdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/mentoring/domain"
)

// Mentoring's per-student view composes the early-warning-style signals
// from each owning module's own service, following the same pattern as
// the analytics readers: mentoring never imports attendance/discipline/
// grading's repository or tables directly.

type MentoringAttendance struct{ Svc *attendanceservice.Service }

func (a MentoringAttendance) MonthlyStatusCounts(ctx context.Context, tenantID, studentID uuid.UUID, month string) (map[string]int, error) {
	_, totals, err := a.Svc.GetMonthlySummary(ctx, tenantID, studentID, month)
	return totals, err
}

type MentoringDiscipline struct{ Svc *disciplineservice.Service }

func (d MentoringDiscipline) StudentPoints(ctx context.Context, tenantID, studentID uuid.UUID) (points, activeCount int, err error) {
	summary, err := d.Svc.StudentSummary(ctx, tenantID, studentID)
	if err != nil {
		return 0, 0, err
	}
	active := 0
	for _, r := range summary.Records {
		if !r.IsVoided() {
			active++
		}
	}
	return summary.TotalPoints, active, nil
}

type MentoringGrading struct{ Svc *gradingservice.Service }

func (g MentoringGrading) PublishedSubjects(ctx context.Context, tenantID, studentID uuid.UUID) ([]mentoringdomain.PublishedGrade, error) {
	grades, err := g.Svc.MyGrades(ctx, tenantID, studentID, uuid.NullUUID{})
	if err != nil {
		return nil, err
	}
	out := make([]mentoringdomain.PublishedGrade, 0, len(grades.Subjects))
	for _, subj := range grades.Subjects {
		if subj.ReportScore == nil {
			continue
		}
		out = append(out, mentoringdomain.PublishedGrade{SubjectID: subj.SubjectID, Score: *subj.ReportScore})
	}
	return out, nil
}
