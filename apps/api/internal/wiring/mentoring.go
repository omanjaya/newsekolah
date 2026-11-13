package wiring

import (
	"context"
	"errors"

	"github.com/google/uuid"

	attendanceservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	disciplineservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/service"
	gradingdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/domain"
	gradingservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/service"
	mentoringdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/mentoring/domain"
	platformdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
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

// MentoringDiscipline reads a mentee's discipline points. While the tenant
// has discipline turned off it reports none (0, 0) without reading
// discipline's records; the web leaves the figures out rather than
// showing zeros.
type MentoringDiscipline struct {
	Svc *disciplineservice.Service
	// Flags reads the discipline feature flag; nil leaves discipline on.
	Flags ModuleFlagReader
}

func (d MentoringDiscipline) StudentPoints(ctx context.Context, tenantID, studentID uuid.UUID) (points, activeCount int, err error) {
	if on, err := moduleEnabled(ctx, d.Flags, tenantID, platformdomain.ModuleDiscipline); err != nil || !on {
		return 0, 0, err
	}
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

// PublishedSubjects is empty, not an error, while the tenant has grading
// turned off: grading refuses every read then, and the mentor's student
// snapshot must still show attendance and discipline instead of failing.
func (g MentoringGrading) PublishedSubjects(ctx context.Context, tenantID, studentID uuid.UUID) ([]mentoringdomain.PublishedGrade, error) {
	grades, err := g.Svc.MyGrades(ctx, tenantID, studentID, uuid.NullUUID{})
	if errors.Is(err, gradingdomain.ErrModuleDisabled) {
		return nil, nil
	}
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
