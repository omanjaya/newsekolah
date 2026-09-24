// Package service is the report centre (docs/11-feature-recommendations.md
// item 10): one catalogue of every export the school can run, one place
// that renders them as XLSX. Each report delegates to the module that owns
// the data through a narrow reader interface, so reports never queries
// another module's tables.
package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

// XLSXContentType and PDFContentType are the two content types ExportReport
// (and the reports schedule job) can return; a leaf platform package like
// httpx does not own MIME strings, so the report centre is the single
// source for its own two.
const (
	XLSXContentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
	PDFContentType  = "application/pdf"
)

var (
	ErrReportNotFound  = errors.New("report not found")
	ErrMissingArgument = errors.New("report argument missing or invalid")
)

// Kind identifies one report in the catalogue.
type Kind string

const (
	KindAttendanceDaily   Kind = "attendance.daily"
	KindDisciplinePoints  Kind = "discipline.points"
	KindWarningLetters    Kind = "discipline.warning_letters"
	KindGradingReport     Kind = "grading.report_scores"
	KindLeaveRequests     Kind = "permits.leave_requests"
	KindExitPermitsYearly Kind = "permits.exit_permits_yearly"
)

// ArgumentKind tells the UI which control to render for a parameter.
type ArgumentKind string

const (
	ArgClass      ArgumentKind = "class"
	ArgGradeLevel ArgumentKind = "grade_level"
	ArgSubject    ArgumentKind = "subject"
	ArgDate       ArgumentKind = "date"
	ArgTerm       ArgumentKind = "term"
)

type Argument struct {
	Name     string
	Kind     ArgumentKind
	Required bool
}

// Definition is one catalogue entry: what it is called, which permission
// it needs, and what the caller has to supply.
type Definition struct {
	Kind       Kind
	Permission string
	Arguments  []Argument
}

// Catalog is the full list; labels live in the UI's i18n catalogue, not here.
func Catalog() []Definition {
	return []Definition{
		// class_id and grade_level_id are individually optional -- Run
		// requires exactly one of them for this kind -- rather than both
		// required, so the catalogue can offer either scope.
		{KindAttendanceDaily, "view_reports", []Argument{{"class_id", ArgClass, false}, {"grade_level_id", ArgGradeLevel, false}, {"date", ArgDate, true}}},
		{KindDisciplinePoints, "view_discipline", []Argument{{"class_id", ArgClass, false}}},
		{KindWarningLetters, "view_discipline", []Argument{{"class_id", ArgClass, false}}},
		{KindGradingReport, "manage_grades", []Argument{{"class_id", ArgClass, true}, {"subject_id", ArgSubject, true}, {"term_id", ArgTerm, false}}},
		{KindLeaveRequests, "view_reports", []Argument{{"class_id", ArgClass, false}}},
		{KindExitPermitsYearly, "view_reports", nil},
	}
}

func Find(kind Kind) (Definition, bool) {
	for _, d := range Catalog() {
		if d.Kind == kind {
			return d, true
		}
	}
	return Definition{}, false
}

// Row is one line of a rendered report; Sheet is the whole thing.
type Sheet struct {
	Title   string
	Headers []string
	Rows    [][]any
}

// Readers are the per-module data sources the wiring layer supplies.
type AttendanceReader interface {
	DailyReportRows(ctx context.Context, tenantID, classID uuid.UUID, date time.Time) (Sheet, error)
	// DailyReportTypedRows is DailyReportRows' data, natively typed
	// (int/string/bool, not everything stringified) for RunDocument's
	// reportdoc.Document -- attendance.daily's reportdoc migration; every
	// other report kind still only needs DailyReportRows' flat Sheet.
	// The status cell is the raw tenant/policy code (or the special
	// "NONE"/"INCOMPLETE"/"MIXED"), and complete is a native bool --
	// RunDocument resolves both to the export's own locale via
	// StatusLabels, since this port itself has no locale.
	DailyReportTypedRows(ctx context.Context, tenantID, classID uuid.UUID, date time.Time) ([][]any, error)
	// StatusLabels returns the tenant's configured attendance status
	// policy as code -> display label (e.g. "H" -> "Hadir"), already in
	// whatever language the tenant chose when configuring it (tenant
	// content, not translated per report locale).
	StatusLabels(ctx context.Context, tenantID uuid.UUID) (map[string]string, error)
}

// ClassRef is the handful of class fields a report needs to label a
// section -- not academic.domain.Class, so this package does not import
// the academic module (docs/03-layered-architecture.md section 1: only
// through a narrow reader interface, satisfied by a wiring adapter).
type ClassRef struct {
	ID   uuid.UUID
	Name string
}

// AcademicReader resolves the class(es) a report's scope refers to: one
// class by id, or every class in a grade level (angkatan) for a
// grade-level-scoped export.
type AcademicReader interface {
	ClassByID(ctx context.Context, tenantID, classID uuid.UUID) (ClassRef, error)
	ClassesInGradeLevel(ctx context.Context, tenantID, gradeLevelID uuid.UUID) ([]ClassRef, error)
	// GradeLevelName resolves a grade level's own name (e.g. "Kelas X"),
	// for a grade-level export's "Angkatan: Kelas X" scope line.
	GradeLevelName(ctx context.Context, tenantID, gradeLevelID uuid.UUID) (string, error)
}

type DisciplineReader interface {
	PointTotalRows(ctx context.Context, tenantID uuid.UUID, classID uuid.NullUUID) (Sheet, error)
	WarningLetterRows(ctx context.Context, tenantID uuid.UUID, classID uuid.NullUUID) (Sheet, error)
}

type GradingReader interface {
	ReportScoreRows(ctx context.Context, tenantID, classID, subjectID uuid.UUID, termID uuid.NullUUID) (Sheet, error)
}

type PermitsReader interface {
	LeaveRequestRows(ctx context.Context, tenantID uuid.UUID, classID uuid.NullUUID) (Sheet, error)
	ExitPermitYearlyRows(ctx context.Context, tenantID uuid.UUID) (Sheet, error)
}

type Service struct {
	attendance AttendanceReader
	discipline DisciplineReader
	grading    GradingReader
	permits    PermitsReader
	academic   AcademicReader
	letterhead reportdoc.LetterheadSource
}

func New(attendance AttendanceReader, discipline DisciplineReader, grading GradingReader, permits PermitsReader) *Service {
	return &Service{attendance: attendance, discipline: discipline, grading: grading, permits: permits}
}

// SetReportDocDependencies wires the reportdoc-backed export path's
// collaborators (grade-level class resolution and the tenant's
// letterhead/signature). Both are optional: with academic nil,
// grade_level_id exports return ErrReportNotFound; with letterhead nil,
// documents render without a kop laporan even when the caller asked for
// one.
func (s *Service) SetReportDocDependencies(academic AcademicReader, letterhead reportdoc.LetterheadSource) {
	s.academic = academic
	s.letterhead = letterhead
}

// RunArgs carries whatever the caller supplied; the service checks that
// the report's required arguments are present.
type RunArgs struct {
	ClassID      uuid.NullUUID
	GradeLevelID uuid.NullUUID
	SubjectID    uuid.NullUUID
	TermID       uuid.NullUUID
	Date         *time.Time
}

// Run renders one report as an XLSX workbook.
func (s *Service) Run(ctx context.Context, tenantID uuid.UUID, kind Kind, args RunArgs) ([]byte, error) {
	def, ok := Find(kind)
	if !ok {
		return nil, ErrReportNotFound
	}
	if err := requireArgs(def, args); err != nil {
		return nil, err
	}
	sheet, err := s.sheet(ctx, tenantID, kind, args)
	if err != nil {
		return nil, err
	}
	return renderXLSX(sheet)
}

// RunDocument renders kind for a download, honouring opts (format, title,
// letterhead, column subset/order/labels) and locale (an
// platform/i18n-style "id"/"en" code -- the tenant's own configured
// locale, resolved by the caller, since a generated document follows the
// school's language, not the requester's Accept-Language). Only
// attendance.daily has migrated onto reportdoc so far
// (docs/05-shared-components.md's migration checklist covers every other
// kind): every other kind falls back to the legacy Run/XLSX path
// regardless of opts.Format or locale, so it keeps working exactly as
// before this endpoint grew customisation options. The returned string
// is the response's content type.
func (s *Service) RunDocument(ctx context.Context, tenantID uuid.UUID, kind Kind, args RunArgs, opts reportdoc.Options, locale string) ([]byte, string, error) {
	def, ok := Find(kind)
	if !ok {
		return nil, "", ErrReportNotFound
	}
	if kind != KindAttendanceDaily {
		xlsx, err := s.Run(ctx, tenantID, kind, args)
		if err != nil {
			return nil, "", err
		}
		return xlsx, XLSXContentType, nil
	}
	if s.attendance == nil {
		return nil, "", ErrReportNotFound
	}
	if err := requireArgs(def, RunArgs{SubjectID: args.SubjectID, TermID: args.TermID, Date: args.Date}); err != nil {
		return nil, "", err
	}
	if !args.ClassID.Valid && !args.GradeLevelID.Valid {
		return nil, "", fmt.Errorf("%w: class_id or grade_level_id", ErrMissingArgument)
	}

	classes, err := s.resolveClasses(ctx, tenantID, args)
	if err != nil {
		return nil, "", err
	}
	statusLabels, err := s.attendance.StatusLabels(ctx, tenantID)
	if err != nil {
		statusLabels = nil // degrade to the special-code fallback text rather than failing the export
	}

	sections := make([]reportdoc.Section, 0, len(classes))
	for _, c := range classes {
		rows, err := s.attendance.DailyReportTypedRows(ctx, tenantID, c.ID, *args.Date)
		if err != nil {
			return nil, "", err
		}
		sections = append(sections, reportdoc.Section{Name: c.Name, Rows: translateAttendanceDailyRows(rows, locale, statusLabels)})
	}

	gradeLevelName := ""
	if args.GradeLevelID.Valid && s.academic != nil {
		gradeLevelName, _ = s.academic.GradeLevelName(ctx, tenantID, args.GradeLevelID.UUID)
	}

	doc := reportdoc.Document{
		Title:           attendanceDailyText(locale, "title"),
		Scope:           attendanceDailyScope(locale, args, classes, gradeLevelName),
		Columns:         attendanceDailyColumns(locale),
		Sections:        sections,
		PageLabelFormat: reportdoc.PageLabel(locale),
		EmptyRowsLabel:  reportdoc.EmptyRowsLabelFor(locale),
	}
	if s.letterhead != nil {
		if lh, sig, err := s.letterhead.Letterhead(ctx, tenantID); err == nil {
			doc.Letterhead = lh
			if sig != nil {
				sig.Date = reportdoc.FormatDate(locale, *args.Date)
				doc.Signature = sig
			}
		}
	}

	doc, err = reportdoc.Apply(doc, opts)
	if err != nil {
		return nil, "", err
	}
	if opts.Format == reportdoc.FormatPDF {
		out, err := reportdoc.RenderPDF(doc)
		return out, PDFContentType, err
	}
	out, err := reportdoc.RenderXLSX(doc)
	return out, XLSXContentType, err
}

// resolveClasses turns args' class_id/grade_level_id scope into the
// class(es) RunDocument builds one Section per; a plain class_id degrades
// to a Section named "" (no academic.AcademicReader wired, or the class
// lookup failed) rather than failing the whole export -- the data itself
// does not depend on knowing the class's name.
func (s *Service) resolveClasses(ctx context.Context, tenantID uuid.UUID, args RunArgs) ([]ClassRef, error) {
	if args.GradeLevelID.Valid {
		if s.academic == nil {
			return nil, ErrReportNotFound
		}
		classes, err := s.academic.ClassesInGradeLevel(ctx, tenantID, args.GradeLevelID.UUID)
		if err != nil {
			return nil, err
		}
		return classes, nil
	}
	name := ""
	if s.academic != nil {
		if c, err := s.academic.ClassByID(ctx, tenantID, args.ClassID.UUID); err == nil {
			name = c.Name
		}
	}
	return []ClassRef{{ID: args.ClassID.UUID, Name: name}}, nil
}

// attendanceDailyScope builds the "Kelas: X-1" / "Angkatan: Kelas X" /
// "Tanggal: 2 September 2026" lines describing what this export covers,
// in locale. gradeLevelName is "" when it could not be resolved (no
// academic.AcademicReader wired, or the lookup failed); the scope line
// then falls back to a class count rather than silently disappearing.
func attendanceDailyScope(locale string, args RunArgs, classes []ClassRef, gradeLevelName string) []reportdoc.ScopeLine {
	var scope []reportdoc.ScopeLine
	switch {
	case args.GradeLevelID.Valid:
		value := gradeLevelName
		if value == "" {
			value = fmt.Sprintf("%d %s", len(classes), attendanceDailyText(locale, "classesUnit"))
		}
		scope = append(scope, reportdoc.ScopeLine{Label: attendanceDailyText(locale, "scopeGradeLevel"), Value: value})
	case len(classes) == 1:
		scope = append(scope, reportdoc.ScopeLine{Label: attendanceDailyText(locale, "scopeClass"), Value: classes[0].Name})
	}
	if args.Date != nil {
		scope = append(scope, reportdoc.ScopeLine{Label: attendanceDailyText(locale, "scopeDate"), Value: reportdoc.FormatDate(locale, *args.Date)})
	}
	return scope
}

// attendanceDailyColumns is attendance.daily's full column set -- the
// same six fields DailyReportRows' Sheet has always had, now with a
// stable Key, a Kind for reportdoc's typed cells, and a locale-correct
// Label. The Key never changes with locale: Options.Columns (and any
// saved column preference) refers to it.
func attendanceDailyColumns(locale string) []reportdoc.Column {
	return []reportdoc.Column{
		{Key: "no", Label: attendanceDailyText(locale, "colNo"), Kind: reportdoc.ColumnNumber, Width: 5},
		{Key: "name", Label: attendanceDailyText(locale, "colName"), Kind: reportdoc.ColumnText, Width: 28},
		{Key: "status", Label: attendanceDailyText(locale, "colStatus"), Kind: reportdoc.ColumnText, Width: 12},
		{Key: "expected_sessions", Label: attendanceDailyText(locale, "colExpected"), Kind: reportdoc.ColumnNumber, Width: 14},
		{Key: "submitted_sessions", Label: attendanceDailyText(locale, "colSubmitted"), Kind: reportdoc.ColumnNumber, Width: 14},
		{Key: "complete", Label: attendanceDailyText(locale, "colComplete"), Kind: reportdoc.ColumnText, Width: 10},
	}
}

// attendanceDailyVocabulary is attendance.daily's own small id/en
// vocabulary: the title, scope labels, column labels, and the words for
// "yes"/"no" and the special status codes DailyReportTypedRows can
// return (NONE/INCOMPLETE/MIXED are not tenant content -- a tenant's own
// status codes are translated via StatusLabels instead, see
// translateAttendanceDailyRows). Other migrated report kinds get their
// own such table; reportdoc itself stays free of this vocabulary (see
// its package doc comment).
var attendanceDailyVocabulary = map[string]map[string]string{
	reportdoc.LocaleID: {
		"title":           "Presensi Harian",
		"scopeGradeLevel": "Angkatan", "scopeClass": "Kelas", "scopeDate": "Tanggal", "classesUnit": "kelas",
		"colNo": "No", "colName": "Nama", "colStatus": "Status",
		"colExpected": "Jumlah Sesi Diharapkan", "colSubmitted": "Jumlah Sesi Terisi", "colComplete": "Lengkap",
		"yes": "Ya", "no": "Tidak",
		"statusNone": "-", "statusIncomplete": "Belum Lengkap", "statusMixed": "Campuran",
	},
	reportdoc.LocaleEN: {
		"title":           "Attendance Daily Report",
		"scopeGradeLevel": "Grade Level", "scopeClass": "Class", "scopeDate": "Date", "classesUnit": "classes",
		"colNo": "No", "colName": "Name", "colStatus": "Status",
		"colExpected": "Expected Sessions", "colSubmitted": "Submitted Sessions", "colComplete": "Complete",
		"yes": "Yes", "no": "No",
		"statusNone": "-", "statusIncomplete": "Incomplete", "statusMixed": "Mixed",
	},
}

func attendanceDailyText(locale, key string) string {
	if m, ok := attendanceDailyVocabulary[locale]; ok {
		if v, ok := m[key]; ok {
			return v
		}
	}
	return attendanceDailyVocabulary[reportdoc.LocaleEN][key]
}

// translateAttendanceDailyRows resolves DailyReportTypedRows' raw status
// code (column index 2) and native bool complete (column index 5) to
// locale-correct display text: a tenant's own status code goes through
// statusLabels (its own configured label, e.g. "H" -> "Hadir", tenant
// content that is never translated by locale); the special codes
// NONE/INCOMPLETE/MIXED and the complete bool go through
// attendanceDailyVocabulary since those are this package's own words.
// rows itself is never mutated; a new slice of new rows is returned.
func translateAttendanceDailyRows(rows [][]any, locale string, statusLabels map[string]string) [][]any {
	const statusCol, completeCol = 2, 5
	out := make([][]any, len(rows))
	for i, row := range rows {
		translated := append([]any(nil), row...)
		if statusCol < len(translated) {
			if code, ok := translated[statusCol].(string); ok {
				translated[statusCol] = attendanceStatusText(locale, code, statusLabels)
			}
		}
		if completeCol < len(translated) {
			if complete, ok := translated[completeCol].(bool); ok {
				key := "no"
				if complete {
					key = "yes"
				}
				translated[completeCol] = attendanceDailyText(locale, key)
			}
		}
		out[i] = translated
	}
	return out
}

func attendanceStatusText(locale, code string, statusLabels map[string]string) string {
	if label, ok := statusLabels[code]; ok && label != "" {
		return label
	}
	switch code {
	case "NONE":
		return attendanceDailyText(locale, "statusNone")
	case "INCOMPLETE":
		return attendanceDailyText(locale, "statusIncomplete")
	case "MIXED":
		return attendanceDailyText(locale, "statusMixed")
	default:
		return code
	}
}

func (s *Service) sheet(ctx context.Context, tenantID uuid.UUID, kind Kind, args RunArgs) (Sheet, error) {
	switch kind {
	case KindAttendanceDaily:
		if s.attendance == nil {
			return Sheet{}, ErrReportNotFound
		}
		return s.attendance.DailyReportRows(ctx, tenantID, args.ClassID.UUID, *args.Date)
	case KindDisciplinePoints:
		if s.discipline == nil {
			return Sheet{}, ErrReportNotFound
		}
		return s.discipline.PointTotalRows(ctx, tenantID, args.ClassID)
	case KindWarningLetters:
		if s.discipline == nil {
			return Sheet{}, ErrReportNotFound
		}
		return s.discipline.WarningLetterRows(ctx, tenantID, args.ClassID)
	case KindGradingReport:
		if s.grading == nil {
			return Sheet{}, ErrReportNotFound
		}
		return s.grading.ReportScoreRows(ctx, tenantID, args.ClassID.UUID, args.SubjectID.UUID, args.TermID)
	case KindLeaveRequests:
		if s.permits == nil {
			return Sheet{}, ErrReportNotFound
		}
		return s.permits.LeaveRequestRows(ctx, tenantID, args.ClassID)
	case KindExitPermitsYearly:
		if s.permits == nil {
			return Sheet{}, ErrReportNotFound
		}
		return s.permits.ExitPermitYearlyRows(ctx, tenantID)
	default:
		return Sheet{}, ErrReportNotFound
	}
}

func requireArgs(def Definition, args RunArgs) error {
	for _, arg := range def.Arguments {
		if !arg.Required {
			continue
		}
		switch arg.Kind {
		case ArgClass:
			if !args.ClassID.Valid {
				return fmt.Errorf("%w: %s", ErrMissingArgument, arg.Name)
			}
		case ArgSubject:
			if !args.SubjectID.Valid {
				return fmt.Errorf("%w: %s", ErrMissingArgument, arg.Name)
			}
		case ArgTerm:
			if !args.TermID.Valid {
				return fmt.Errorf("%w: %s", ErrMissingArgument, arg.Name)
			}
		case ArgDate:
			if args.Date == nil {
				return fmt.Errorf("%w: %s", ErrMissingArgument, arg.Name)
			}
		}
	}
	return nil
}

// renderXLSX writes one sheet with a header row and the data below it.
func renderXLSX(sheet Sheet) ([]byte, error) {
	f := excelize.NewFile()
	defer f.Close() //nolint:errcheck // an in-memory workbook cannot fail to close after WriteToBuffer

	name := sheet.Title
	if name == "" {
		name = "Report"
	}
	if err := f.SetSheetName("Sheet1", name); err != nil {
		return nil, fmt.Errorf("rename sheet: %w", err)
	}
	for col, header := range sheet.Headers {
		cell, err := excelize.CoordinatesToCellName(col+1, 1)
		if err != nil {
			return nil, fmt.Errorf("cell name: %w", err)
		}
		if err := f.SetCellValue(name, cell, header); err != nil {
			return nil, fmt.Errorf("write header: %w", err)
		}
	}
	for i, row := range sheet.Rows {
		for col, value := range row {
			cell, err := excelize.CoordinatesToCellName(col+1, i+2)
			if err != nil {
				return nil, fmt.Errorf("cell name: %w", err)
			}
			if err := f.SetCellValue(name, cell, value); err != nil {
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
