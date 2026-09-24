package wiring

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	academicdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
	attendanceservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	disciplinedomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/domain"
	disciplineservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/service"
	familyservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/family/service"
	gradingservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/service"
	identityservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	permitsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	reportsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/reports/service"
	schooldomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/school/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
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

// ReportsAcademic is the reports module's narrow view of the academic
// module: enough to resolve a grade-level report scope into its classes
// (one section per class, ordered by name), to validate a subject is
// actually taught at a grade level, and to name a class/grade
// level/subject for a scope line. Implemented structurally by
// *academic/service.Service -- see cmd/api/wire.go.
type ReportsAcademic interface {
	GetClass(ctx context.Context, tenantID, id uuid.UUID) (academicdomain.Class, error)
	GetGradeLevel(ctx context.Context, tenantID, id uuid.UUID) (academicdomain.GradeLevel, error)
	GetSubject(ctx context.Context, tenantID, id uuid.UUID) (academicdomain.Subject, error)
	ListClassesByYearAndGradeLevel(ctx context.Context, tenantID, yearID, gradeLevelID uuid.UUID) ([]academicdomain.Class, error)
	SubjectOfferedAtGradeLevel(ctx context.Context, tenantID, yearID, subjectID, gradeLevelID uuid.UUID) (bool, error)
}

// ReportsYears resolves the active academic year, for a report's "Tahun
// Ajaran" scope line. Implemented structurally by *school/service.Service.
// GetActiveAcademicYear (not the two-call GetActiveAcademicYearID +
// ActiveAcademicYearLabel pair other modules use) is deliberate: that
// pair is documented as reusing an *already open* tenant transaction
// (school/service/academic_year.go), which none of these readers have --
// each owning module's own methods open their own. GetActiveAcademicYear
// opens its own, and returns the Label alongside the ID in one call.
type ReportsYears interface {
	GetActiveAcademicYear(ctx context.Context, tenantID uuid.UUID) (schooldomain.AcademicYear, bool, error)
}

// NameLookup resolves user ids to names for export columns.
type NameLookup interface {
	Names(ctx context.Context, tenantID uuid.UUID, ids []uuid.UUID) (map[uuid.UUID]string, error)
}

// reportScope is one class/grade-level report argument, already
// resolved: which classes to build one section per (empty for a report
// scoped to neither, which prints one unnamed section covering every
// class), plus the scope lines that describe the selection.
type reportScope struct {
	YearID  uuid.UUID
	Lines   []reportdoc.ScopeLine
	Classes []academicdomain.Class
}

// resolveScope turns a class_id/grade_level_id pair (already validated
// mutually exclusive by reports/service.Run) into a reportScope: the
// active year's classes for a grade level, or the single named class, or
// -- for the reports whose class argument is optional -- neither.
func resolveScope(ctx context.Context, academic ReportsAcademic, years ReportsYears, tenantID uuid.UUID, classID, gradeLevelID uuid.NullUUID) (reportScope, error) {
	year, ok, err := years.GetActiveAcademicYear(ctx, tenantID)
	if err != nil {
		return reportScope{}, err
	}
	if !ok {
		return reportScope{}, reportsservice.ErrNoActiveAcademicYear
	}
	var lines []reportdoc.ScopeLine
	if year.Label != "" {
		lines = append(lines, reportdoc.ScopeLine{Label: "Tahun Ajaran", Value: year.Label})
	}

	switch {
	case classID.Valid:
		class, err := academic.GetClass(ctx, tenantID, classID.UUID)
		if err != nil {
			return reportScope{}, err
		}
		lines = append(lines, reportdoc.ScopeLine{Label: "Kelas", Value: class.Name})
		return reportScope{YearID: year.ID, Lines: lines, Classes: []academicdomain.Class{class}}, nil
	case gradeLevelID.Valid:
		level, err := academic.GetGradeLevel(ctx, tenantID, gradeLevelID.UUID)
		if err != nil {
			return reportScope{}, err
		}
		classes, err := academic.ListClassesByYearAndGradeLevel(ctx, tenantID, year.ID, gradeLevelID.UUID)
		if err != nil {
			return reportScope{}, err
		}
		lines = append(lines, reportdoc.ScopeLine{Label: "Angkatan", Value: level.Name})
		return reportScope{YearID: year.ID, Lines: lines, Classes: classes}, nil
	default:
		lines = append(lines, reportdoc.ScopeLine{Label: "Cakupan", Value: "Seluruh kelas"})
		return reportScope{YearID: year.ID, Lines: lines}, nil
	}
}

// dateOrNil turns a possibly-zero time.Time into the reportdoc-friendly
// value for a ColumnDate cell: the time itself, or nil (rendered blank)
// when it was never set (e.g. a student with no violation yet).
func dateOrNil(t time.Time) any {
	if t.IsZero() {
		return nil
	}
	return t
}

func floatPtrOrNil(v *float64) any {
	if v == nil {
		return nil
	}
	return *v
}

type DisciplineReports struct {
	Svc       *disciplineservice.Service
	Directory NameLookup
	Academic  ReportsAcademic
	Years     ReportsYears
}

// PointTotalRows adds one column per SP level ("SP 1 Tanggal", "SP 2
// Tanggal", ...) holding the date the student's running total first
// crossed it -- the old app's "Status SP" column
// (violation_reports.go:152-169), lost when the point recap moved to
// this generic exporter. classID/gradeLevelID pick one class, every
// class of a grade level (one section per class), or neither (one
// section covering the whole school).
func (d DisciplineReports) PointTotalRows(ctx context.Context, tenantID uuid.UUID, classID, gradeLevelID uuid.NullUUID) (reportdoc.Document, error) {
	scope, err := resolveScope(ctx, d.Academic, d.Years, tenantID, classID, gradeLevelID)
	if err != nil {
		return reportdoc.Document{}, err
	}
	policy, err := d.Svc.Policy(ctx, tenantID)
	if err != nil {
		return reportdoc.Document{}, err
	}
	columns := disciplinePointColumns(policy)
	sections, err := d.pointSections(ctx, tenantID, scope, policy)
	if err != nil {
		return reportdoc.Document{}, err
	}
	return reportdoc.Document{Title: "Rekap Poin Pelanggaran", Scope: scope.Lines, Columns: columns, Sections: sections}, nil
}

func disciplinePointColumns(policy disciplinedomain.SPPolicy) []reportdoc.Column {
	columns := []reportdoc.Column{
		{Key: "no", Label: "No", Kind: reportdoc.ColumnNumber, Width: 6},
		{Key: "student_name", Label: "Nama Siswa", Kind: reportdoc.ColumnText, Width: 28},
		{Key: "total_points", Label: "Total Poin", Kind: reportdoc.ColumnNumber, Width: 12},
		{Key: "record_count", Label: "Jumlah Catatan", Kind: reportdoc.ColumnNumber, Width: 14},
		{Key: "last_violation", Label: "Pelanggaran Terakhir", Kind: reportdoc.ColumnDate, Width: 16},
	}
	for _, lvl := range policy.Levels {
		columns = append(columns, reportdoc.Column{
			Key: fmt.Sprintf("sp_level_%d_date", lvl.Level), Label: lvl.Label + " Tanggal", Kind: reportdoc.ColumnDate, Width: 14,
		})
	}
	return columns
}

func (d DisciplineReports) pointSections(ctx context.Context, tenantID uuid.UUID, scope reportScope, policy disciplinedomain.SPPolicy) ([]reportdoc.Section, error) {
	if len(scope.Classes) == 0 {
		sec, err := d.pointSection(ctx, tenantID, uuid.NullUUID{}, "", policy)
		if err != nil {
			return nil, err
		}
		return []reportdoc.Section{sec}, nil
	}
	sections := make([]reportdoc.Section, 0, len(scope.Classes))
	for _, class := range scope.Classes {
		sec, err := d.pointSection(ctx, tenantID, uuid.NullUUID{UUID: class.ID, Valid: true}, class.Name, policy)
		if err != nil {
			return nil, err
		}
		sections = append(sections, sec)
	}
	return sections, nil
}

func (d DisciplineReports) pointSection(ctx context.Context, tenantID uuid.UUID, classID uuid.NullUUID, name string, policy disciplinedomain.SPPolicy) (reportdoc.Section, error) {
	totals, err := d.Svc.PointTotals(ctx, tenantID, classID, 500)
	if err != nil {
		return reportdoc.Section{}, err
	}
	ids := make([]uuid.UUID, len(totals))
	for i, t := range totals {
		ids[i] = t.StudentUserID
	}
	names, err := d.names(ctx, tenantID, ids)
	if err != nil {
		return reportdoc.Section{}, err
	}
	crossed, err := d.Svc.FirstCrossedDates(ctx, tenantID, classID)
	if err != nil {
		return reportdoc.Section{}, err
	}
	rows := make([][]any, len(totals))
	for i, t := range totals {
		row := []any{i + 1, names[t.StudentUserID], t.Total, t.RecordCount, dateOrNil(t.LastOccurredOn)}
		for _, lvl := range policy.Levels {
			var v any
			if date, ok := crossed[t.StudentUserID][lvl.Level]; ok {
				v = date
			}
			row = append(row, v)
		}
		rows[i] = row
	}
	return reportdoc.Section{Name: name, Rows: rows}, nil
}

func (d DisciplineReports) WarningLetterRows(ctx context.Context, tenantID uuid.UUID, classID, gradeLevelID uuid.NullUUID) (reportdoc.Document, error) {
	scope, err := resolveScope(ctx, d.Academic, d.Years, tenantID, classID, gradeLevelID)
	if err != nil {
		return reportdoc.Document{}, err
	}
	columns := []reportdoc.Column{
		{Key: "no", Label: "No", Kind: reportdoc.ColumnNumber, Width: 6},
		{Key: "letter_number", Label: "Nomor Surat", Kind: reportdoc.ColumnText, Width: 20},
		{Key: "student_name", Label: "Nama Siswa", Kind: reportdoc.ColumnText, Width: 28},
		{Key: "level", Label: "Tingkat", Kind: reportdoc.ColumnText, Width: 12},
		{Key: "total_points", Label: "Total Poin", Kind: reportdoc.ColumnNumber, Width: 12},
		{Key: "issued_at", Label: "Tanggal Terbit", Kind: reportdoc.ColumnDate, Width: 16},
	}
	sections, err := d.warningSections(ctx, tenantID, scope)
	if err != nil {
		return reportdoc.Document{}, err
	}
	return reportdoc.Document{Title: "Surat Peringatan", Scope: scope.Lines, Columns: columns, Sections: sections}, nil
}

func (d DisciplineReports) warningSections(ctx context.Context, tenantID uuid.UUID, scope reportScope) ([]reportdoc.Section, error) {
	if len(scope.Classes) == 0 {
		sec, err := d.warningSection(ctx, tenantID, uuid.NullUUID{}, "")
		if err != nil {
			return nil, err
		}
		return []reportdoc.Section{sec}, nil
	}
	sections := make([]reportdoc.Section, 0, len(scope.Classes))
	for _, class := range scope.Classes {
		sec, err := d.warningSection(ctx, tenantID, uuid.NullUUID{UUID: class.ID, Valid: true}, class.Name)
		if err != nil {
			return nil, err
		}
		sections = append(sections, sec)
	}
	return sections, nil
}

func (d DisciplineReports) warningSection(ctx context.Context, tenantID uuid.UUID, classID uuid.NullUUID, name string) (reportdoc.Section, error) {
	letters, err := d.Svc.ListWarningLetters(ctx, tenantID, classID, 200, 0)
	if err != nil {
		return reportdoc.Section{}, err
	}
	ids := make([]uuid.UUID, len(letters))
	for i, l := range letters {
		ids[i] = l.StudentUserID
	}
	names, err := d.names(ctx, tenantID, ids)
	if err != nil {
		return reportdoc.Section{}, err
	}
	rows := make([][]any, len(letters))
	for i, l := range letters {
		rows[i] = []any{i + 1, l.LetterNumber, names[l.StudentUserID], l.LevelLabel, l.TotalPoints, dateOrNil(l.IssuedAt)}
	}
	return reportdoc.Section{Name: name, Rows: rows}, nil
}

func (d DisciplineReports) names(ctx context.Context, tenantID uuid.UUID, ids []uuid.UUID) (map[uuid.UUID]string, error) {
	if d.Directory == nil {
		return map[uuid.UUID]string{}, nil
	}
	return d.Directory.Names(ctx, tenantID, ids)
}

type GradingReports struct {
	Svc      *gradingservice.Service
	Academic ReportsAcademic
	Years    ReportsYears
}

// ReportScoreRows renders the report-score recap for one class or every
// class of a grade level (one section per class). A grade-level scope
// first validates subjectID is actually offered there (reports/service.
// ErrSubjectNotOffered otherwise), then builds one column per assessment
// component seen across every class in the scope, in first-seen order --
// classes normally share the same components for one subject/grade
// level, but a class missing one simply prints a blank rather than
// losing that component's column for every other class.
func (g GradingReports) ReportScoreRows(ctx context.Context, tenantID uuid.UUID, classID, gradeLevelID uuid.NullUUID, subjectID uuid.UUID, termID uuid.NullUUID) (reportdoc.Document, error) {
	scope, err := resolveScope(ctx, g.Academic, g.Years, tenantID, classID, gradeLevelID)
	if err != nil {
		return reportdoc.Document{}, err
	}
	if len(scope.Classes) == 0 {
		// grading.report_scores' class argument is required (Catalog);
		// Run's requireArgs already refuses a call that reaches here with
		// neither class_id nor grade_level_id set.
		return reportdoc.Document{}, reportsservice.ErrMissingArgument
	}
	if gradeLevelID.Valid {
		offered, err := g.Academic.SubjectOfferedAtGradeLevel(ctx, tenantID, scope.YearID, subjectID, gradeLevelID.UUID)
		if err != nil {
			return reportdoc.Document{}, err
		}
		if !offered {
			return reportdoc.Document{}, reportsservice.ErrSubjectNotOffered
		}
	}
	subject, err := g.Academic.GetSubject(ctx, tenantID, subjectID)
	if err != nil {
		return reportdoc.Document{}, err
	}
	scope.Lines = append(scope.Lines, reportdoc.ScopeLine{Label: "Mata Pelajaran", Value: subject.Name})

	// Scheduled/manual report exports run without a per-request teacher
	// actor, so this reads with the same admin bypass the grading
	// handler grants manage_master_data -- true here is not "some
	// teacher", it is "this is the reports module's own trusted read".
	books := make([]gradingservice.Gradebook, len(scope.Classes))
	var termLabel string
	var componentOrder []uuid.UUID
	componentCode := map[uuid.UUID]string{}
	seenComponent := map[uuid.UUID]bool{}
	for i, class := range scope.Classes {
		book, err := g.Svc.Gradebook(ctx, tenantID, uuid.Nil, true, gradingservice.GradebookQuery{ClassID: class.ID, SubjectID: subjectID, TermID: termID})
		if err != nil {
			return reportdoc.Document{}, err
		}
		books[i] = book
		if termLabel == "" {
			termLabel = book.Term.Name
		}
		for _, c := range book.Components {
			if seenComponent[c.ID] {
				continue
			}
			seenComponent[c.ID] = true
			componentOrder = append(componentOrder, c.ID)
			componentCode[c.ID] = c.Code
		}
	}
	if termLabel != "" {
		scope.Lines = append(scope.Lines, reportdoc.ScopeLine{Label: "Semester", Value: termLabel})
	}

	columns := []reportdoc.Column{
		{Key: "no", Label: "No", Kind: reportdoc.ColumnNumber, Width: 6},
		{Key: "student_name", Label: "Nama Siswa", Kind: reportdoc.ColumnText, Width: 28},
	}
	for _, id := range componentOrder {
		code := componentCode[id]
		columns = append(columns, reportdoc.Column{Key: "component_" + code, Label: code, Kind: reportdoc.ColumnNumber, Width: 10})
	}
	columns = append(columns,
		reportdoc.Column{Key: "average", Label: "Rata-rata", Kind: reportdoc.ColumnNumber, Width: 10},
		reportdoc.Column{Key: "report_score", Label: "Nilai Rapor", Kind: reportdoc.ColumnNumber, Width: 10},
	)

	sections := make([]reportdoc.Section, len(scope.Classes))
	for i, class := range scope.Classes {
		book := books[i]
		rows := make([][]any, len(book.Students))
		for r, student := range book.Students {
			row := make([]any, 0, len(columns))
			row = append(row, r+1, student.Name)
			for _, id := range componentOrder {
				if score, ok := student.Scores[id]; ok {
					row = append(row, score)
				} else {
					row = append(row, nil)
				}
			}
			row = append(row, floatPtrOrNil(student.Average), floatPtrOrNil(student.ReportScore))
			rows[r] = row
		}
		sections[i] = reportdoc.Section{Name: class.Name, Rows: rows}
	}

	return reportdoc.Document{Title: "Nilai Rapor", Scope: scope.Lines, Columns: columns, Sections: sections}, nil
}

type PermitsReports struct {
	Svc      *permitsservice.Service
	Academic ReportsAcademic
	Years    ReportsYears
}

// LeaveRequestRows renders the leave-request recap for one class, every
// class of a grade level (one section per class), or -- scoped to
// neither -- one section covering every class. The review queue is
// scoped to the caller's duties, so the export mirrors exactly what that
// person may see on screen.
func (p PermitsReports) LeaveRequestRows(ctx context.Context, tenantID uuid.UUID, classID, gradeLevelID uuid.NullUUID) (reportdoc.Document, error) {
	scope, err := resolveScope(ctx, p.Academic, p.Years, tenantID, classID, gradeLevelID)
	if err != nil {
		return reportdoc.Document{}, err
	}
	columns := []reportdoc.Column{
		{Key: "no", Label: "No", Kind: reportdoc.ColumnNumber, Width: 6},
		{Key: "student_name", Label: "Nama Siswa", Kind: reportdoc.ColumnText, Width: 28},
		{Key: "class_name", Label: "Kelas", Kind: reportdoc.ColumnText, Width: 12},
		{Key: "category", Label: "Kategori", Kind: reportdoc.ColumnText, Width: 16},
		{Key: "starts_on", Label: "Mulai", Kind: reportdoc.ColumnDate, Width: 14},
		{Key: "ends_on", Label: "Selesai", Kind: reportdoc.ColumnDate, Width: 14},
		{Key: "letter_number", Label: "Nomor Surat", Kind: reportdoc.ColumnText, Width: 18},
		{Key: "status", Label: "Status", Kind: reportdoc.ColumnText, Width: 14},
	}
	sections, err := p.leaveSections(ctx, tenantID, scope)
	if err != nil {
		return reportdoc.Document{}, err
	}
	return reportdoc.Document{Title: "Rekap Pengajuan Izin", Scope: scope.Lines, Columns: columns, Sections: sections}, nil
}

func (p PermitsReports) leaveSections(ctx context.Context, tenantID uuid.UUID, scope reportScope) ([]reportdoc.Section, error) {
	if len(scope.Classes) == 0 {
		sec, err := p.leaveSection(ctx, tenantID, uuid.NullUUID{}, "")
		if err != nil {
			return nil, err
		}
		return []reportdoc.Section{sec}, nil
	}
	sections := make([]reportdoc.Section, 0, len(scope.Classes))
	for _, class := range scope.Classes {
		sec, err := p.leaveSection(ctx, tenantID, uuid.NullUUID{UUID: class.ID, Valid: true}, class.Name)
		if err != nil {
			return nil, err
		}
		sections = append(sections, sec)
	}
	return sections, nil
}

func (p PermitsReports) leaveSection(ctx context.Context, tenantID uuid.UUID, classID uuid.NullUUID, name string) (reportdoc.Section, error) {
	items, err := p.Svc.ListLeaveRequestsForReview(ctx, tenantID, uuid.Nil, classID)
	if err != nil {
		return reportdoc.Section{}, err
	}
	rows := make([][]any, len(items))
	for i, item := range items {
		rows[i] = []any{
			i + 1, item.StudentNameSnapshot, item.ClassNameSnapshot, string(item.Category),
			dateOrNil(item.StartsOn), dateOrNil(item.EndsOn), item.LetterNumber, string(item.Status),
		}
	}
	return reportdoc.Section{Name: name, Rows: rows}, nil
}

// ExitPermitYearlyRows is the counselor's yearly export (missing feature,
// docs/analysis/backend-inventory.md 1.15): every exit permit opened this
// academic year, regardless of status. It has no class/grade-level scope
// of its own (the catalog declares no arguments for it), so it is always
// a single unnamed section.
func (p PermitsReports) ExitPermitYearlyRows(ctx context.Context, tenantID uuid.UUID) (reportdoc.Document, error) {
	var lines []reportdoc.ScopeLine
	if year, ok, err := p.Years.GetActiveAcademicYear(ctx, tenantID); err == nil && ok && year.Label != "" {
		lines = append(lines, reportdoc.ScopeLine{Label: "Tahun Ajaran", Value: year.Label})
	}
	rows, err := p.Svc.ExitPermitYearlyReportRows(ctx, tenantID)
	if err != nil {
		return reportdoc.Document{}, err
	}
	columns := []reportdoc.Column{
		{Key: "no", Label: "No", Kind: reportdoc.ColumnNumber, Width: 6},
		{Key: "student_name", Label: "Nama Siswa", Kind: reportdoc.ColumnText, Width: 28},
		{Key: "class_name", Label: "Kelas", Kind: reportdoc.ColumnText, Width: 12},
		{Key: "destination", Label: "Tujuan", Kind: reportdoc.ColumnText, Width: 24},
		{Key: "opened_at", Label: "Dibuka", Kind: reportdoc.ColumnDate, Width: 16},
		{Key: "status", Label: "Status", Kind: reportdoc.ColumnText, Width: 14},
		{Key: "exited_at", Label: "Keluar Pada", Kind: reportdoc.ColumnDate, Width: 16},
	}
	sectionRows := make([][]any, len(rows))
	for i, row := range rows {
		var exitedAt any
		if row.ExitedAt != nil {
			exitedAt = *row.ExitedAt
		}
		sectionRows[i] = []any{
			i + 1, row.StudentNameSnapshot, row.ClassNameSnapshot, row.Destination,
			dateOrNil(row.OpenedAt), string(row.Status), exitedAt,
		}
	}
	return reportdoc.Document{
		Title: "Rekap Izin Keluar Tahunan Siswa", Scope: lines, Columns: columns,
		Sections: []reportdoc.Section{{Rows: sectionRows}},
	}, nil
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
