package wiring

import (
	"context"
	"time"

	"github.com/google/uuid"

	attendanceservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	disciplineservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/service"
	familyservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/family/service"
	gradingservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/service"
	identityservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	permitsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	reportsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/reports/service"
)

// Report readers turn each module's own view types into the flat sheet the
// report centre renders. Column headers stay English here: the workbook is
// a data export, and the UI labels the report itself.

type AttendanceReports struct{ Svc *attendanceservice.Service }

func (a AttendanceReports) DailyReportRows(ctx context.Context, tenantID, classID uuid.UUID, date time.Time) (reportsservice.Sheet, error) {
	report, err := a.Svc.GetDailyReport(ctx, tenantID, classID, date)
	if err != nil {
		return reportsservice.Sheet{}, err
	}
	sheet := reportsservice.Sheet{
		Title:   "Attendance",
		Headers: []string{"No", "Name", "Status", "Expected Sessions", "Submitted Sessions", "Complete"},
		Rows:    make([][]any, len(report.Students)),
	}
	for i, s := range report.Students {
		sheet.Rows[i] = []any{i + 1, s.Name, s.StatusCode, s.ExpectedSessions, s.SubmittedSessions, s.Complete}
	}
	return sheet, nil
}

type DisciplineReports struct {
	Svc       *disciplineservice.Service
	Directory NameLookup
}

// NameLookup resolves user ids to names for export columns.
type NameLookup interface {
	Names(ctx context.Context, tenantID uuid.UUID, ids []uuid.UUID) (map[uuid.UUID]string, error)
}

func (d DisciplineReports) PointTotalRows(ctx context.Context, tenantID uuid.UUID, classID uuid.NullUUID) (reportsservice.Sheet, error) {
	totals, err := d.Svc.PointTotals(ctx, tenantID, classID, 500)
	if err != nil {
		return reportsservice.Sheet{}, err
	}
	ids := make([]uuid.UUID, len(totals))
	for i, t := range totals {
		ids[i] = t.StudentUserID
	}
	names, err := d.names(ctx, tenantID, ids)
	if err != nil {
		return reportsservice.Sheet{}, err
	}
	sheet := reportsservice.Sheet{
		Title:   "Discipline",
		Headers: []string{"No", "Student", "Points", "Records", "Last Violation"},
		Rows:    make([][]any, len(totals)),
	}
	for i, t := range totals {
		last := ""
		if !t.LastOccurredOn.IsZero() {
			last = t.LastOccurredOn.Format("2006-01-02")
		}
		sheet.Rows[i] = []any{i + 1, names[t.StudentUserID], t.Total, t.RecordCount, last}
	}
	return sheet, nil
}

func (d DisciplineReports) WarningLetterRows(ctx context.Context, tenantID uuid.UUID, classID uuid.NullUUID) (reportsservice.Sheet, error) {
	letters, err := d.Svc.ListWarningLetters(ctx, tenantID, classID, 200, 0)
	if err != nil {
		return reportsservice.Sheet{}, err
	}
	ids := make([]uuid.UUID, len(letters))
	for i, l := range letters {
		ids[i] = l.StudentUserID
	}
	names, err := d.names(ctx, tenantID, ids)
	if err != nil {
		return reportsservice.Sheet{}, err
	}
	sheet := reportsservice.Sheet{
		Title:   "Warning Letters",
		Headers: []string{"No", "Number", "Student", "Level", "Total Points", "Issued At"},
		Rows:    make([][]any, len(letters)),
	}
	for i, l := range letters {
		sheet.Rows[i] = []any{i + 1, l.LetterNumber, names[l.StudentUserID], l.LevelLabel, l.TotalPoints, l.IssuedAt.Format("2006-01-02")}
	}
	return sheet, nil
}

func (d DisciplineReports) names(ctx context.Context, tenantID uuid.UUID, ids []uuid.UUID) (map[uuid.UUID]string, error) {
	if d.Directory == nil {
		return map[uuid.UUID]string{}, nil
	}
	return d.Directory.Names(ctx, tenantID, ids)
}

type GradingReports struct{ Svc *gradingservice.Service }

func (g GradingReports) ReportScoreRows(ctx context.Context, tenantID, classID, subjectID uuid.UUID, termID uuid.NullUUID) (reportsservice.Sheet, error) {
	book, err := g.Svc.Gradebook(ctx, tenantID, gradingservice.GradebookQuery{ClassID: classID, SubjectID: subjectID, TermID: termID})
	if err != nil {
		return reportsservice.Sheet{}, err
	}
	headers := []string{"No", "Student"}
	for _, c := range book.Components {
		headers = append(headers, c.Code)
	}
	headers = append(headers, "Average", "Report Score")

	sheet := reportsservice.Sheet{Title: "Grades", Headers: headers, Rows: make([][]any, len(book.Students))}
	for i, student := range book.Students {
		row := make([]any, 0, len(headers))
		row = append(row, i+1, student.Name)
		for _, c := range book.Components {
			if score, ok := student.Scores[c.ID]; ok {
				row = append(row, score)
			} else {
				row = append(row, "")
			}
		}
		row = append(row, valueOrBlank(student.Average), valueOrBlank(student.ReportScore))
		sheet.Rows[i] = row
	}
	return sheet, nil
}

func valueOrBlank(v *float64) any {
	if v == nil {
		return ""
	}
	return *v
}

type PermitsReports struct{ Svc *permitsservice.Service }

func (p PermitsReports) LeaveRequestRows(ctx context.Context, tenantID uuid.UUID, classID uuid.NullUUID) (reportsservice.Sheet, error) {
	// The review queue is scoped to the caller's duties, so the export
	// mirrors exactly what that person may see on screen.
	items, err := p.Svc.ListLeaveRequestsForReview(ctx, tenantID, uuid.Nil, classID)
	if err != nil {
		return reportsservice.Sheet{}, err
	}
	sheet := reportsservice.Sheet{
		Title:   "Leave Requests",
		Headers: []string{"No", "Student", "Class", "Category", "From", "To", "Letter Number", "Status"},
		Rows:    make([][]any, len(items)),
	}
	for i, item := range items {
		sheet.Rows[i] = []any{
			i + 1, item.StudentNameSnapshot, item.ClassNameSnapshot, string(item.Category),
			item.StartsOn.Format("2006-01-02"), item.EndsOn.Format("2006-01-02"), item.LetterNumber, string(item.Status),
		}
	}
	return sheet, nil
}

// ExitPermitYearlyRows is the counselor's yearly export (missing feature,
// docs/analysis/backend-inventory.md 1.15): every exit permit opened this
// academic year, regardless of status.
func (p PermitsReports) ExitPermitYearlyRows(ctx context.Context, tenantID uuid.UUID) (reportsservice.Sheet, error) {
	rows, err := p.Svc.ExitPermitYearlyReportRows(ctx, tenantID)
	if err != nil {
		return reportsservice.Sheet{}, err
	}
	sheet := reportsservice.Sheet{
		Title:   "Exit Permits",
		Headers: []string{"No", "Student", "Class", "Destination", "Opened At", "Status", "Exited At"},
		Rows:    make([][]any, len(rows)),
	}
	for i, row := range rows {
		exitedAt := ""
		if row.ExitedAt != nil {
			exitedAt = row.ExitedAt.Format("2006-01-02 15:04")
		}
		sheet.Rows[i] = []any{
			i + 1, row.StudentNameSnapshot, row.ClassNameSnapshot, row.Destination,
			row.OpenedAt.Format("2006-01-02 15:04"), string(row.Status), exitedAt,
		}
	}
	return sheet, nil
}

// IdentityNames adapts identity's directory listing to the NameLookup the
// report readers need.
type IdentityNames struct{ Svc *identityservice.Service }

func (n IdentityNames) Names(ctx context.Context, tenantID uuid.UUID, ids []uuid.UUID) (map[uuid.UUID]string, error) {
	out := make(map[uuid.UUID]string, len(ids))
	if len(ids) == 0 {
		return out, nil
	}
	wanted := make(map[uuid.UUID]struct{}, len(ids))
	for _, id := range ids {
		wanted[id] = struct{}{}
	}
	filter := identityservice.ListUsersFilter{Status: "active", Limit: 100}
	for {
		result, err := n.Svc.ListUsers(ctx, tenantID, filter)
		if err != nil {
			return nil, err
		}
		for _, u := range result.Items {
			if _, ok := wanted[u.ID]; ok {
				out[u.ID] = u.Name
			}
		}
		if result.NextCursor == uuid.Nil || len(out) == len(wanted) {
			return out, nil
		}
		filter.Cursor = result.NextCursor
	}
}

// Family readers give the parent view read-only access to each child's
// data without the family module importing those modules.

type FamilyAttendance struct{ Svc *attendanceservice.Service }

func (f FamilyAttendance) StudentMonth(ctx context.Context, tenantID, studentID uuid.UUID, month string) ([]familyservice.CalendarDay, map[string]int, error) {
	days, totals, err := f.Svc.GetMonthlySummary(ctx, tenantID, studentID, month)
	if err != nil {
		return nil, nil, err
	}
	out := make([]familyservice.CalendarDay, len(days))
	for i, d := range days {
		out[i] = familyservice.CalendarDay{
			Date: d.Date.Format("2006-01-02"), StatusCode: d.StatusCode,
			ExpectedSessions: d.ExpectedSessions, SubmittedSessions: d.SubmittedSessions, Complete: d.Complete,
		}
	}
	return out, totals, nil
}

type FamilyGrading struct{ Svc *gradingservice.Service }

func (f FamilyGrading) StudentGrades(ctx context.Context, tenantID, studentID uuid.UUID) (familyservice.StudentGrades, error) {
	grades, err := f.Svc.MyGrades(ctx, tenantID, studentID, uuid.NullUUID{})
	if err != nil {
		return familyservice.StudentGrades{}, err
	}
	out := familyservice.StudentGrades{TermID: grades.Term.ID, TermName: grades.Term.Name, Stars: grades.Stars}
	out.Subjects = make([]familyservice.SubjectGrade, len(grades.Subjects))
	for i, s := range grades.Subjects {
		out.Subjects[i] = familyservice.SubjectGrade{SubjectID: s.SubjectID, Average: s.Average, ReportScore: s.ReportScore}
	}
	return out, nil
}

type FamilyDiscipline struct{ Svc *disciplineservice.Service }

func (f FamilyDiscipline) StudentDiscipline(ctx context.Context, tenantID, studentID uuid.UUID) (familyservice.StudentDiscipline, error) {
	summary, err := f.Svc.StudentSummary(ctx, tenantID, studentID)
	if err != nil {
		return familyservice.StudentDiscipline{}, err
	}
	out := familyservice.StudentDiscipline{TotalPoints: summary.TotalPoints}
	for _, r := range summary.Records {
		if r.IsVoided() {
			continue
		}
		out.Records = append(out.Records, familyservice.DisciplineRecord{TypeName: r.TypeName, Points: r.PointsSnapshot, OccurredOn: r.OccurredOn.Format("2006-01-02")})
	}
	out.Letters = make([]familyservice.DisciplineLetter, len(summary.Letters))
	for i, l := range summary.Letters {
		out.Letters[i] = familyservice.DisciplineLetter{Number: l.LetterNumber, LevelLabel: l.LevelLabel, IssuedAt: l.IssuedAt.Format("2006-01-02")}
	}
	return out, nil
}
