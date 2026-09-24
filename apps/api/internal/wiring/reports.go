package wiring

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	academicdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
	academicservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/service"
	attendanceservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	disciplinedomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/domain"
	disciplineservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/service"
	familyservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/family/service"
	gradingservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/service"
	identityservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	permitsdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	permitsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	reportsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/reports/service"
	schooldomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/school/domain"
	schoolservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/school/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

// Report readers turn each module's own view types into the reportdoc.
// Document the report centre renders (attendance.daily also keeps a
// typed-rows path -- see DailyReportTypedRows -- for its reportdoc
// migration; every other kind below builds its Document directly).

type AttendanceReports struct{ Svc *attendanceservice.Service }

// DailyReportTypedRows is attendance.daily's rows, natively typed for
// reportdoc.Section.Rows. Each row's status is still the raw tenant/
// policy code (e.g. "H", or the special "INCOMPLETE"/"NONE"/"MIXED") and
// complete is a native bool, not translated to any locale --
// reports/service.RunDocument resolves the status label (via
// StatusLabels) and the complete text itself, since it is the layer that
// knows the export's locale; this port stays locale-agnostic.
func (a AttendanceReports) DailyReportTypedRows(ctx context.Context, tenantID, classID uuid.UUID, date time.Time) ([][]any, error) {
	report, err := a.Svc.GetDailyReport(ctx, tenantID, classID, date)
	if err != nil {
		return nil, err
	}
	rows := make([][]any, len(report.Students))
	for i, s := range report.Students {
		rows[i] = []any{i + 1, s.Name, s.StatusCode, s.ExpectedSessions, s.SubmittedSessions, s.Complete}
	}
	return rows, nil
}

// StatusLabels adapts attendance's exported StatusPolicy to the reports
// module's narrow code -> label port (reportsservice.AttendanceReader).
func (a AttendanceReports) StatusLabels(ctx context.Context, tenantID uuid.UUID) (map[string]string, error) {
	policy, err := a.Svc.StatusPolicy(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	out := make(map[string]string, len(policy.Statuses))
	for _, def := range policy.Statuses {
		out[def.Code] = def.Label
	}
	return out, nil
}

// AcademicReports resolves the class(es) attendance.daily's grade-level
// (angkatan) scope needs: School gives the active academic year,
// Academic lists that year's classes for a grade level or a single class
// by id. The other report kinds below resolve their own scope through
// ReportsAcademic/ReportsYears instead (their column sets vary by scope
// in ways reports.ClassRef does not capture, e.g. grading.report_scores'
// per-component columns).
type AcademicReports struct {
	Academic *academicservice.Service
	School   *schoolservice.Service
}

func (a AcademicReports) ClassByID(ctx context.Context, tenantID, classID uuid.UUID) (reportsservice.ClassRef, error) {
	c, err := a.Academic.GetClass(ctx, tenantID, classID)
	if err != nil {
		return reportsservice.ClassRef{}, err
	}
	return reportsservice.ClassRef{ID: c.ID, Name: c.Name}, nil
}

// ClassesInGradeLevel resolves the active academic year through
// School.GetActiveAcademicYear rather than the GetActiveAcademicYearID +
// ActiveAcademicYearLabel pair: that pair is documented (school/service/
// academic_year.go) as reusing an *already open* tenant transaction,
// which this method -- called directly from reports/service.Service,
// with no transaction of its own -- does not have. Calling it without one
// silently returns "no active academic year" under RLS instead of the
// row that is actually there. GetActiveAcademicYear opens its own
// transaction, so it works from any caller.
func (a AcademicReports) ClassesInGradeLevel(ctx context.Context, tenantID, gradeLevelID uuid.UUID) ([]reportsservice.ClassRef, error) {
	year, ok, err := a.School.GetActiveAcademicYear(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, reportsservice.ErrNoActiveAcademicYear
	}
	classes, err := a.Academic.ListClassesByYearAndGradeLevel(ctx, tenantID, year.ID, gradeLevelID)
	if err != nil {
		return nil, err
	}
	out := make([]reportsservice.ClassRef, len(classes))
	for i, c := range classes {
		out[i] = reportsservice.ClassRef{ID: c.ID, Name: c.Name}
	}
	return out, nil
}

// GradeLevelName resolves gradeLevelID's own name (e.g. "Kelas X"), for
// a grade-level-scoped export's scope line ("Angkatan: Kelas X"), via
// academic.Service.GetGradeLevel (a single-row lookup, not a scan).
func (a AcademicReports) GradeLevelName(ctx context.Context, tenantID, gradeLevelID uuid.UUID) (string, error) {
	level, err := a.Academic.GetGradeLevel(ctx, tenantID, gradeLevelID)
	if err != nil {
		return "", err
	}
	return level.Name, nil
}

// ReportHeaderReports loads a tenant's configured kop laporan and default
// signature for reportdoc's LetterheadSource port (see
// reportdoc.LetterheadSource's doc comment).
type ReportHeaderReports struct{ Svc *schoolservice.Service }

func (r ReportHeaderReports) Letterhead(ctx context.Context, tenantID uuid.UUID) (*reportdoc.Letterhead, *reportdoc.Signature, error) {
	return r.Svc.ReportLetterhead(ctx, tenantID)
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
// ActiveAcademicYearLabel pair other modules use) is deliberate: see
// AcademicReports.ClassesInGradeLevel's doc comment for why.
type ReportsYears interface {
	GetActiveAcademicYear(ctx context.Context, tenantID uuid.UUID) (schooldomain.AcademicYear, bool, error)
}

// NameLookup resolves user ids to names for export columns.
type NameLookup interface {
	Names(ctx context.Context, tenantID uuid.UUID, ids []uuid.UUID) (map[uuid.UUID]string, error)
}

// reportVocabulary is a small id/en lookup table for one report kind's
// own words (title, scope labels, column labels, enum values) -- the
// same pattern reports/service.go's attendanceDailyVocabulary uses for
// attendance.daily. reportdoc itself stays free of this vocabulary (see
// its package doc comment); every migrated kind gets its own table.
type reportVocabulary map[string]map[string]string

func (v reportVocabulary) text(locale, key string) string {
	if m, ok := v[locale]; ok {
		if s, ok := m[key]; ok {
			return s
		}
	}
	return v[reportdoc.LocaleEN][key]
}

// scopeVocabulary is the id/en wording resolveScope and classSignature
// use, shared by every report kind scoped through them.
var scopeVocabulary = reportVocabulary{
	reportdoc.LocaleID: {
		"academicYear": "Tahun Ajaran", "class": "Kelas", "gradeLevel": "Angkatan",
		"scope": "Cakupan", "allClasses": "Seluruh kelas", "homeroomTeacher": "Wali Kelas",
	},
	reportdoc.LocaleEN: {
		"academicYear": "Academic Year", "class": "Class", "gradeLevel": "Grade Level",
		"scope": "Scope", "allClasses": "All classes", "homeroomTeacher": "Homeroom Teacher",
	},
}

// reportScope is one class/grade-level report argument, already
// resolved: which classes to build one section per (empty for a report
// scoped to neither, which prints one unnamed section covering every
// class), plus the scope lines that describe the selection, in locale.
type reportScope struct {
	YearID  uuid.UUID
	Lines   []reportdoc.ScopeLine
	Classes []academicdomain.Class
}

// resolveScope turns a class_id/grade_level_id pair (already validated
// mutually exclusive by reports/service.RunDocument) into a reportScope:
// the active year's classes for a grade level, or the single named class,
// or -- for the reports whose class argument is optional -- neither.
func resolveScope(ctx context.Context, academic ReportsAcademic, years ReportsYears, tenantID uuid.UUID, classID, gradeLevelID uuid.NullUUID, locale string) (reportScope, error) {
	year, ok, err := years.GetActiveAcademicYear(ctx, tenantID)
	if err != nil {
		return reportScope{}, err
	}
	if !ok {
		return reportScope{}, reportsservice.ErrNoActiveAcademicYear
	}
	var lines []reportdoc.ScopeLine
	if year.Label != "" {
		lines = append(lines, reportdoc.ScopeLine{Label: scopeVocabulary.text(locale, "academicYear"), Value: year.Label})
	}

	switch {
	case classID.Valid:
		class, err := academic.GetClass(ctx, tenantID, classID.UUID)
		if err != nil {
			return reportScope{}, err
		}
		lines = append(lines, reportdoc.ScopeLine{Label: scopeVocabulary.text(locale, "class"), Value: class.Name})
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
		lines = append(lines, reportdoc.ScopeLine{Label: scopeVocabulary.text(locale, "gradeLevel"), Value: level.Name})
		return reportScope{YearID: year.ID, Lines: lines, Classes: classes}, nil
	default:
		lines = append(lines, reportdoc.ScopeLine{Label: scopeVocabulary.text(locale, "scope"), Value: scopeVocabulary.text(locale, "allClasses")})
		return reportScope{YearID: year.ID, Lines: lines}, nil
	}
}

// classSignature builds a partial Signature carrying only the class's own
// Wali Kelas (homeroom teacher) as its one signer, for a report scoped to
// exactly one class; reports/service.Service.attachLetterhead appends the
// tenant's own default signer after it, giving a two-signer block (the
// class's homeroom teacher on the left, the tenant default -- typically
// Kepala Sekolah -- on the right). Grade-level and whole-school scope
// have no single homeroom teacher to name, so they get no partial
// signature at all: attachLetterhead then applies only the tenant
// default, never a signature with an empty signer.
func classSignature(ctx context.Context, directory NameLookup, tenantID uuid.UUID, classes []academicdomain.Class, locale string) *reportdoc.Signature {
	if len(classes) != 1 || directory == nil {
		return nil
	}
	class := classes[0]
	if class.HomeroomTeacherID == nil {
		return nil
	}
	names, err := directory.Names(ctx, tenantID, []uuid.UUID{*class.HomeroomTeacherID})
	if err != nil {
		return nil
	}
	name := names[*class.HomeroomTeacherID]
	if name == "" {
		return nil
	}
	return &reportdoc.Signature{Signers: []reportdoc.Signer{{RoleLabel: scopeVocabulary.text(locale, "homeroomTeacher"), Name: name}}}
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

// permitsVocabulary mirrors the exact wording apps/web/messages/{id,en}.json
// already use for these same enum values (leave request category and
// workflow status), so a downloaded report reads the same as the screen
// it came from rather than a raw storage code like "religious_ceremony".
var permitsVocabulary = reportVocabulary{
	reportdoc.LocaleID: {
		"leaveTitle": "Rekap Pengajuan Izin", "exitTitle": "Rekap Izin Keluar Tahunan Siswa",
		"colNo": "No", "colStudentName": "Nama Siswa", "colClassName": "Kelas",
		"colCategory": "Kategori", "colStartsOn": "Mulai", "colEndsOn": "Selesai",
		"colLetterNumber": "Nomor Surat", "colStatus": "Status",
		"colDestination": "Tujuan", "colOpenedAt": "Dibuka", "colExitedAt": "Keluar Pada",
		"categorySick": "Sakit", "categoryReligious": "Upacara keagamaan",
		"categoryDispensation": "Dispensasi", "categoryOther": "Lainnya",
		"statusInProgress": "Berjalan", "statusApproved": "Disetujui", "statusCompleted": "Selesai",
		"statusRejected": "Ditolak", "statusCancelled": "Dibatalkan", "statusExpired": "Kedaluwarsa",
	},
	reportdoc.LocaleEN: {
		"leaveTitle": "Leave Requests Summary", "exitTitle": "Yearly Exit Permits Summary",
		"colNo": "No", "colStudentName": "Student Name", "colClassName": "Class",
		"colCategory": "Category", "colStartsOn": "Starts", "colEndsOn": "Ends",
		"colLetterNumber": "Letter Number", "colStatus": "Status",
		"colDestination": "Destination", "colOpenedAt": "Opened", "colExitedAt": "Exited At",
		"categorySick": "Sick", "categoryReligious": "Religious Ceremony",
		"categoryDispensation": "Dispensation", "categoryOther": "Other",
		"statusInProgress": "In Progress", "statusApproved": "Approved", "statusCompleted": "Completed",
		"statusRejected": "Rejected", "statusCancelled": "Cancelled", "statusExpired": "Expired",
	},
}

var permitsCategoryKeys = map[permitsdomain.Category]string{
	permitsdomain.CategorySick:              "categorySick",
	permitsdomain.CategoryReligiousCeremony: "categoryReligious",
	permitsdomain.CategoryDispensation:      "categoryDispensation",
	permitsdomain.CategoryOther:             "categoryOther",
}

func permitsCategoryLabel(locale string, c permitsdomain.Category) string {
	key, ok := permitsCategoryKeys[c]
	if !ok {
		return string(c)
	}
	return permitsVocabulary.text(locale, key)
}

var permitsStatusKeys = map[permitsdomain.Status]string{
	permitsdomain.StatusInProgress: "statusInProgress",
	permitsdomain.StatusApproved:   "statusApproved",
	permitsdomain.StatusCompleted:  "statusCompleted",
	permitsdomain.StatusRejected:   "statusRejected",
	permitsdomain.StatusCancelled:  "statusCancelled",
	permitsdomain.StatusExpired:    "statusExpired",
}

func permitsStatusLabel(locale string, s permitsdomain.Status) string {
	key, ok := permitsStatusKeys[s]
	if !ok {
		return string(s)
	}
	return permitsVocabulary.text(locale, key)
}

// disciplineVocabulary is discipline.points/discipline.warning_letters'
// own id/en words.
var disciplineVocabulary = reportVocabulary{
	reportdoc.LocaleID: {
		"pointsTitle": "Rekap Poin Pelanggaran", "lettersTitle": "Surat Peringatan",
		"colNo": "No", "colStudentName": "Nama Siswa", "colTotalPoints": "Total Poin",
		"colRecordCount": "Jumlah Catatan", "colLastViolation": "Pelanggaran Terakhir",
		"levelDateSuffix": " Tanggal",
		"colLetterNumber": "Nomor Surat", "colLevel": "Tingkat", "colIssuedAt": "Tanggal Terbit",
	},
	reportdoc.LocaleEN: {
		"pointsTitle": "Discipline Points Summary", "lettersTitle": "Warning Letters",
		"colNo": "No", "colStudentName": "Student Name", "colTotalPoints": "Total Points",
		"colRecordCount": "Record Count", "colLastViolation": "Last Violation",
		"levelDateSuffix": " Date",
		"colLetterNumber": "Letter Number", "colLevel": "Level", "colIssuedAt": "Issued Date",
	},
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
// section covering the whole school). SP level labels are the tenant's
// own configured policy text (e.g. "SP 1"), never translated by locale;
// only the " Tanggal"/" Date" suffix and everything else is.
func (d DisciplineReports) PointTotalRows(ctx context.Context, tenantID uuid.UUID, classID, gradeLevelID uuid.NullUUID, locale string) (reportdoc.Document, error) {
	scope, err := resolveScope(ctx, d.Academic, d.Years, tenantID, classID, gradeLevelID, locale)
	if err != nil {
		return reportdoc.Document{}, err
	}
	policy, err := d.Svc.Policy(ctx, tenantID)
	if err != nil {
		return reportdoc.Document{}, err
	}
	columns := disciplinePointColumns(locale, policy)
	sections, err := d.pointSections(ctx, tenantID, scope, policy)
	if err != nil {
		return reportdoc.Document{}, err
	}
	doc := reportdoc.Document{Title: disciplineVocabulary.text(locale, "pointsTitle"), Scope: scope.Lines, Columns: columns, Sections: sections}
	doc.Signature = classSignature(ctx, d.Directory, tenantID, scope.Classes, locale)
	return doc, nil
}

func disciplinePointColumns(locale string, policy disciplinedomain.SPPolicy) []reportdoc.Column {
	columns := []reportdoc.Column{
		{Key: "no", Label: disciplineVocabulary.text(locale, "colNo"), Kind: reportdoc.ColumnNumber, Width: 6},
		{Key: "student_name", Label: disciplineVocabulary.text(locale, "colStudentName"), Kind: reportdoc.ColumnText, Width: 28},
		{Key: "total_points", Label: disciplineVocabulary.text(locale, "colTotalPoints"), Kind: reportdoc.ColumnNumber, Width: 12},
		{Key: "record_count", Label: disciplineVocabulary.text(locale, "colRecordCount"), Kind: reportdoc.ColumnNumber, Width: 14},
		{Key: "last_violation", Label: disciplineVocabulary.text(locale, "colLastViolation"), Kind: reportdoc.ColumnDate, Width: 16},
	}
	for _, lvl := range policy.Levels {
		columns = append(columns, reportdoc.Column{
			Key: fmt.Sprintf("sp_level_%d_date", lvl.Level), Label: lvl.Label + disciplineVocabulary.text(locale, "levelDateSuffix"), Kind: reportdoc.ColumnDate, Width: 14,
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

func (d DisciplineReports) WarningLetterRows(ctx context.Context, tenantID uuid.UUID, classID, gradeLevelID uuid.NullUUID, locale string) (reportdoc.Document, error) {
	scope, err := resolveScope(ctx, d.Academic, d.Years, tenantID, classID, gradeLevelID, locale)
	if err != nil {
		return reportdoc.Document{}, err
	}
	columns := []reportdoc.Column{
		{Key: "no", Label: disciplineVocabulary.text(locale, "colNo"), Kind: reportdoc.ColumnNumber, Width: 6},
		{Key: "letter_number", Label: disciplineVocabulary.text(locale, "colLetterNumber"), Kind: reportdoc.ColumnText, Width: 20},
		{Key: "student_name", Label: disciplineVocabulary.text(locale, "colStudentName"), Kind: reportdoc.ColumnText, Width: 28},
		{Key: "level", Label: disciplineVocabulary.text(locale, "colLevel"), Kind: reportdoc.ColumnText, Width: 12},
		{Key: "total_points", Label: disciplineVocabulary.text(locale, "colTotalPoints"), Kind: reportdoc.ColumnNumber, Width: 12},
		{Key: "issued_at", Label: disciplineVocabulary.text(locale, "colIssuedAt"), Kind: reportdoc.ColumnDate, Width: 16},
	}
	sections, err := d.warningSections(ctx, tenantID, scope)
	if err != nil {
		return reportdoc.Document{}, err
	}
	doc := reportdoc.Document{Title: disciplineVocabulary.text(locale, "lettersTitle"), Scope: scope.Lines, Columns: columns, Sections: sections}
	doc.Signature = classSignature(ctx, d.Directory, tenantID, scope.Classes, locale)
	return doc, nil
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

// gradingVocabulary is grading.report_scores' own id/en words. Component
// codes stay tenant content (never translated by locale), same as SP
// level labels.
var gradingVocabulary = reportVocabulary{
	reportdoc.LocaleID: {
		"title": "Nilai Rapor", "colNo": "No", "colStudentName": "Nama Siswa",
		"colAverage": "Rata-rata", "colReportScore": "Nilai Rapor",
		"scopeSubject": "Mata Pelajaran", "scopeTerm": "Semester",
	},
	reportdoc.LocaleEN: {
		"title": "Report Card Scores", "colNo": "No", "colStudentName": "Student Name",
		"colAverage": "Average", "colReportScore": "Report Score",
		"scopeSubject": "Subject", "scopeTerm": "Term",
	},
}

type GradingReports struct {
	Svc       *gradingservice.Service
	Academic  ReportsAcademic
	Years     ReportsYears
	Directory NameLookup
}

// ReportScoreRows renders the report-score recap for one class or every
// class of a grade level (one section per class). A grade-level scope
// first validates subjectID is actually offered there (reports/service.
// ErrSubjectNotOffered otherwise), then builds one column per assessment
// component seen across every class in the scope, in first-seen order --
// classes normally share the same components for one subject/grade
// level, but a class missing one simply prints a blank rather than
// losing that component's column for every other class.
func (g GradingReports) ReportScoreRows(ctx context.Context, tenantID uuid.UUID, classID, gradeLevelID uuid.NullUUID, subjectID uuid.UUID, termID uuid.NullUUID, locale string) (reportdoc.Document, error) {
	scope, columns, books, componentOrder, err := g.scopeAndColumns(ctx, tenantID, classID, gradeLevelID, subjectID, termID, locale)
	if err != nil {
		return reportdoc.Document{}, err
	}

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

	doc := reportdoc.Document{Title: gradingVocabulary.text(locale, "title"), Scope: scope.Lines, Columns: columns, Sections: sections}
	doc.Signature = classSignature(ctx, g.Directory, tenantID, scope.Classes, locale)
	return doc, nil
}

// ReportScoreColumns is ReportScoreRows' columns alone, for GET
// /v1/reports/grading.report_scores/columns: the export dialog's way of
// discovering this kind's per-component columns for the scope/subject/
// term the caller chose, without paying for (or displaying) every row.
func (g GradingReports) ReportScoreColumns(ctx context.Context, tenantID uuid.UUID, classID, gradeLevelID uuid.NullUUID, subjectID uuid.UUID, termID uuid.NullUUID, locale string) ([]reportdoc.Column, error) {
	_, columns, _, _, err := g.scopeAndColumns(ctx, tenantID, classID, gradeLevelID, subjectID, termID, locale)
	return columns, err
}

// scopeAndColumns is ReportScoreRows/ReportScoreColumns' shared work:
// resolve scope, validate the subject is offered when scoped to a grade
// level, fetch every class's Gradebook (rows are only used by
// ReportScoreRows, but the Gradebook call itself is the cheapest way to
// learn a class's components -- there is no separate components-only
// query), and build the column set from every component seen.
func (g GradingReports) scopeAndColumns(
	ctx context.Context, tenantID uuid.UUID, classID, gradeLevelID uuid.NullUUID, subjectID uuid.UUID, termID uuid.NullUUID, locale string,
) (reportScope, []reportdoc.Column, []gradingservice.Gradebook, []uuid.UUID, error) {
	scope, err := resolveScope(ctx, g.Academic, g.Years, tenantID, classID, gradeLevelID, locale)
	if err != nil {
		return reportScope{}, nil, nil, nil, err
	}
	if len(scope.Classes) == 0 {
		// grading.report_scores' class argument is required (Catalog);
		// RunDocument's requireArgs already refuses a call that reaches
		// here with neither class_id nor grade_level_id set.
		return reportScope{}, nil, nil, nil, reportsservice.ErrMissingArgument
	}
	if gradeLevelID.Valid {
		offered, err := g.Academic.SubjectOfferedAtGradeLevel(ctx, tenantID, scope.YearID, subjectID, gradeLevelID.UUID)
		if err != nil {
			return reportScope{}, nil, nil, nil, err
		}
		if !offered {
			return reportScope{}, nil, nil, nil, reportsservice.ErrSubjectNotOffered
		}
	}
	subject, err := g.Academic.GetSubject(ctx, tenantID, subjectID)
	if err != nil {
		return reportScope{}, nil, nil, nil, err
	}
	scope.Lines = append(scope.Lines, reportdoc.ScopeLine{Label: gradingVocabulary.text(locale, "scopeSubject"), Value: subject.Name})

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
			return reportScope{}, nil, nil, nil, err
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
		scope.Lines = append(scope.Lines, reportdoc.ScopeLine{Label: gradingVocabulary.text(locale, "scopeTerm"), Value: termLabel})
	}

	columns := []reportdoc.Column{
		{Key: "no", Label: gradingVocabulary.text(locale, "colNo"), Kind: reportdoc.ColumnNumber, Width: 6},
		{Key: "student_name", Label: gradingVocabulary.text(locale, "colStudentName"), Kind: reportdoc.ColumnText, Width: 28},
	}
	for _, id := range componentOrder {
		code := componentCode[id]
		columns = append(columns, reportdoc.Column{Key: "component_" + code, Label: code, Kind: reportdoc.ColumnNumber, Width: 10})
	}
	columns = append(columns,
		reportdoc.Column{Key: "average", Label: gradingVocabulary.text(locale, "colAverage"), Kind: reportdoc.ColumnNumber, Width: 10},
		reportdoc.Column{Key: "report_score", Label: gradingVocabulary.text(locale, "colReportScore"), Kind: reportdoc.ColumnNumber, Width: 10},
	)
	return scope, columns, books, componentOrder, nil
}

type PermitsReports struct {
	Svc       *permitsservice.Service
	Academic  ReportsAcademic
	Years     ReportsYears
	Directory NameLookup
}

// LeaveRequestRows renders the leave-request recap for one class, every
// class of a grade level (one section per class), or -- scoped to
// neither -- one section covering every class. The review queue is
// scoped to the caller's duties, so the export mirrors exactly what that
// person may see on screen.
func (p PermitsReports) LeaveRequestRows(ctx context.Context, tenantID uuid.UUID, classID, gradeLevelID uuid.NullUUID, locale string) (reportdoc.Document, error) {
	scope, err := resolveScope(ctx, p.Academic, p.Years, tenantID, classID, gradeLevelID, locale)
	if err != nil {
		return reportdoc.Document{}, err
	}
	columns := []reportdoc.Column{
		{Key: "no", Label: permitsVocabulary.text(locale, "colNo"), Kind: reportdoc.ColumnNumber, Width: 6},
		{Key: "student_name", Label: permitsVocabulary.text(locale, "colStudentName"), Kind: reportdoc.ColumnText, Width: 28},
		{Key: "class_name", Label: permitsVocabulary.text(locale, "colClassName"), Kind: reportdoc.ColumnText, Width: 12},
		{Key: "category", Label: permitsVocabulary.text(locale, "colCategory"), Kind: reportdoc.ColumnText, Width: 16},
		{Key: "starts_on", Label: permitsVocabulary.text(locale, "colStartsOn"), Kind: reportdoc.ColumnDate, Width: 14},
		{Key: "ends_on", Label: permitsVocabulary.text(locale, "colEndsOn"), Kind: reportdoc.ColumnDate, Width: 14},
		{Key: "letter_number", Label: permitsVocabulary.text(locale, "colLetterNumber"), Kind: reportdoc.ColumnText, Width: 18},
		{Key: "status", Label: permitsVocabulary.text(locale, "colStatus"), Kind: reportdoc.ColumnText, Width: 14},
	}
	sections, err := p.leaveSections(ctx, tenantID, scope, locale)
	if err != nil {
		return reportdoc.Document{}, err
	}
	doc := reportdoc.Document{Title: permitsVocabulary.text(locale, "leaveTitle"), Scope: scope.Lines, Columns: columns, Sections: sections}
	doc.Signature = classSignature(ctx, p.Directory, tenantID, scope.Classes, locale)
	return doc, nil
}

func (p PermitsReports) leaveSections(ctx context.Context, tenantID uuid.UUID, scope reportScope, locale string) ([]reportdoc.Section, error) {
	if len(scope.Classes) == 0 {
		sec, err := p.leaveSection(ctx, tenantID, uuid.NullUUID{}, "", locale)
		if err != nil {
			return nil, err
		}
		return []reportdoc.Section{sec}, nil
	}
	sections := make([]reportdoc.Section, 0, len(scope.Classes))
	for _, class := range scope.Classes {
		sec, err := p.leaveSection(ctx, tenantID, uuid.NullUUID{UUID: class.ID, Valid: true}, class.Name, locale)
		if err != nil {
			return nil, err
		}
		sections = append(sections, sec)
	}
	return sections, nil
}

func (p PermitsReports) leaveSection(ctx context.Context, tenantID uuid.UUID, classID uuid.NullUUID, name, locale string) (reportdoc.Section, error) {
	items, err := p.Svc.ListLeaveRequestsForReview(ctx, tenantID, uuid.Nil, classID)
	if err != nil {
		return reportdoc.Section{}, err
	}
	rows := make([][]any, len(items))
	for i, item := range items {
		rows[i] = []any{
			i + 1, item.StudentNameSnapshot, item.ClassNameSnapshot, permitsCategoryLabel(locale, item.Category),
			dateOrNil(item.StartsOn), dateOrNil(item.EndsOn), item.LetterNumber, permitsStatusLabel(locale, item.Status),
		}
	}
	return reportdoc.Section{Name: name, Rows: rows}, nil
}

// ExitPermitYearlyRows is the counselor's yearly export (missing feature,
// docs/analysis/backend-inventory.md 1.15): every exit permit opened this
// academic year, regardless of status. It has no class/grade-level scope
// of its own (the catalog declares no arguments for it), so it is always
// a single unnamed section with no class-specific signer.
func (p PermitsReports) ExitPermitYearlyRows(ctx context.Context, tenantID uuid.UUID, locale string) (reportdoc.Document, error) {
	var lines []reportdoc.ScopeLine
	if year, ok, err := p.Years.GetActiveAcademicYear(ctx, tenantID); err == nil && ok && year.Label != "" {
		lines = append(lines, reportdoc.ScopeLine{Label: scopeVocabulary.text(locale, "academicYear"), Value: year.Label})
	}
	rows, err := p.Svc.ExitPermitYearlyReportRows(ctx, tenantID)
	if err != nil {
		return reportdoc.Document{}, err
	}
	columns := []reportdoc.Column{
		{Key: "no", Label: permitsVocabulary.text(locale, "colNo"), Kind: reportdoc.ColumnNumber, Width: 6},
		{Key: "student_name", Label: permitsVocabulary.text(locale, "colStudentName"), Kind: reportdoc.ColumnText, Width: 28},
		{Key: "class_name", Label: permitsVocabulary.text(locale, "colClassName"), Kind: reportdoc.ColumnText, Width: 12},
		{Key: "destination", Label: permitsVocabulary.text(locale, "colDestination"), Kind: reportdoc.ColumnText, Width: 24},
		{Key: "opened_at", Label: permitsVocabulary.text(locale, "colOpenedAt"), Kind: reportdoc.ColumnDate, Width: 16},
		{Key: "status", Label: permitsVocabulary.text(locale, "colStatus"), Kind: reportdoc.ColumnText, Width: 14},
		{Key: "exited_at", Label: permitsVocabulary.text(locale, "colExitedAt"), Kind: reportdoc.ColumnDate, Width: 16},
	}
	sectionRows := make([][]any, len(rows))
	for i, row := range rows {
		var exitedAt any
		if row.ExitedAt != nil {
			exitedAt = *row.ExitedAt
		}
		sectionRows[i] = []any{
			i + 1, row.StudentNameSnapshot, row.ClassNameSnapshot, row.Destination,
			dateOrNil(row.OpenedAt), permitsStatusLabel(locale, row.Status), exitedAt,
		}
	}
	return reportdoc.Document{
		Title: permitsVocabulary.text(locale, "exitTitle"), Scope: lines, Columns: columns,
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

// FamilySubjects adapts academic's subject catalogue to the batched
// subject-name lookup family needs to label a child's per-subject grades
// -- parents cannot call /v1/academic/subjects themselves (they lack
// view_academic_data), so the response must already carry the names.
type FamilySubjects struct{ Svc *academicservice.Service }

func (f FamilySubjects) SubjectNames(ctx context.Context, tenantID uuid.UUID, ids []uuid.UUID) (map[uuid.UUID]string, error) {
	out := make(map[uuid.UUID]string, len(ids))
	for _, id := range ids {
		if _, ok := out[id]; ok {
			continue
		}
		subject, err := f.Svc.GetSubject(ctx, tenantID, id)
		if err != nil {
			return nil, err
		}
		out[id] = subject.Name
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

// FamilyLeaveRequests lets a guardian open a planned leave request for a
// linked child from the parent view, reusing permits' own submission path
// (same validation: active enrollment, homeroom teacher present, category
// and date range) instead of duplicating it here.
type FamilyLeaveRequests struct{ Svc *permitsservice.Service }

func (f FamilyLeaveRequests) SubmitChildLeaveRequest(
	ctx context.Context, tenantID, guardianUserID, studentUserID uuid.UUID,
	category, reason string, startsOn, endsOn time.Time,
) (uuid.UUID, error) {
	cat := permitsdomain.Category(category)
	if !cat.Valid() {
		return uuid.Nil, familyservice.ErrLeaveCategoryInvalid
	}
	detail, err := f.Svc.SubmitLeaveRequest(ctx, permitsservice.SubmitLeaveRequestInput{
		TenantID: tenantID, ActorUserID: guardianUserID, StudentUserID: studentUserID,
		Category: cat, Reason: reason, StartsOn: startsOn, EndsOn: endsOn,
	})
	if err != nil {
		switch {
		case errors.Is(err, permitsdomain.ErrLeaveRequestGuardianNotLinked):
			return uuid.Nil, familyservice.ErrLeaveGuardianNotApproving
		case errors.Is(err, permitsdomain.ErrLeaveRequestDateRangeInvalid):
			return uuid.Nil, familyservice.ErrLeaveDateRangeInvalid
		case errors.Is(err, permitsdomain.ErrHomeroomTeacherRequired):
			return uuid.Nil, familyservice.ErrLeaveHomeroomRequired
		case errors.Is(err, permitsdomain.ErrAlreadyInProgress):
			return uuid.Nil, familyservice.ErrLeaveAlreadyInProgress
		default:
			return uuid.Nil, err
		}
	}
	return detail.Instance.ID, nil
}
