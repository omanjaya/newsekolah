// Package service is the report centre (docs/11-feature-recommendations.md
// item 10): one catalogue of every export the school can run, one place
// that renders them as XLSX or PDF through the shared reportdoc package.
// Each report delegates to the module that owns the data through a narrow
// reader interface, so reports never queries another module's tables.
package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

// XLSXContentType and PDFContentType are the two content types
// RunDocument (and the reports schedule job) can return; a leaf platform
// package like httpx does not own MIME strings, so the report centre is
// the single source for its own two.
const (
	XLSXContentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
	PDFContentType  = "application/pdf"
)

var (
	ErrReportNotFound  = errors.New("report not found")
	ErrMissingArgument = errors.New("report argument missing or invalid")
	// ErrScopeConflict is returned when a caller supplies both class_id
	// and grade_level_id: a report scoped to a class runs against exactly
	// one class or every class of one grade level, never both at once.
	ErrScopeConflict = errors.New("class_id and grade_level_id are mutually exclusive")
	// ErrSubjectNotOffered is returned by grading.report_scores when the
	// requested grade-level scope has no subject offering for the
	// requested subject -- running the export would otherwise silently
	// produce empty sections for every class in it.
	ErrSubjectNotOffered = errors.New("subject is not taught at this grade level")
	// ErrNoActiveAcademicYear is returned by the class/grade-level-scoped
	// readers (wiring/reports.go's resolveScope) when the tenant has no
	// active academic year to resolve a grade level's classes against.
	ErrNoActiveAcademicYear = errors.New("no active academic year")
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

// ArgumentKind tells the UI which control to render for a parameter. A
// "class" argument accepts either a class_id or a grade_level_id (the web
// form offers both as one "Kelas atau Angkatan" scope picker); the two
// are mutually exclusive, enforced by RunDocument.
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

// Catalog is the full list; labels live in the UI's i18n catalogue, not
// here. Every kind that accepts a class also accepts a grade_level_id in
// its place (one section per class in the grade level); the two arguments
// are individually optional even where a scope is mandatory (grading.
// report_scores) -- RunDocument enforces "exactly one of them" itself,
// since the catalogue's per-argument Required flag cannot express "one of
// two" on its own.
func Catalog() []Definition {
	return []Definition{
		{KindAttendanceDaily, "view_reports", []Argument{{"class_id", ArgClass, false}, {"grade_level_id", ArgGradeLevel, false}, {"date", ArgDate, true}}},
		{KindDisciplinePoints, "view_discipline", []Argument{{"class_id", ArgClass, false}, {"grade_level_id", ArgGradeLevel, false}}},
		{KindWarningLetters, "view_discipline", []Argument{{"class_id", ArgClass, false}, {"grade_level_id", ArgGradeLevel, false}}},
		{KindGradingReport, "view_grades", []Argument{{"class_id", ArgClass, true}, {"grade_level_id", ArgGradeLevel, false}, {"subject_id", ArgSubject, true}, {"term_id", ArgTerm, false}}},
		{KindLeaveRequests, "view_reports", []Argument{{"class_id", ArgClass, false}, {"grade_level_id", ArgGradeLevel, false}}},
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

// AttendanceReader supplies attendance.daily's rows, natively typed
// (int/string/bool, not stringified) for RunDocument's reportdoc.Document.
type AttendanceReader interface {
	// DailyReportTypedRows' status cell is the raw tenant/policy code (or
	// the special "NONE"/"INCOMPLETE"/"MIXED"), and complete is a native
	// bool -- RunDocument resolves both to the export's own locale via
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

// AcademicReader resolves the class(es) attendance.daily's scope refers
// to: one class by id, or every class in a grade level (angkatan) for a
// grade-level-scoped export, plus the grade level's own display name for
// its scope line. The other catalogue kinds resolve their own scope
// internally (see wiring/reports.go's resolveScope) since their column
// sets vary by scope in ways this generic shape does not capture (e.g.
// grading.report_scores' per-component columns).
type AcademicReader interface {
	ClassByID(ctx context.Context, tenantID, classID uuid.UUID) (ClassRef, error)
	ClassesInGradeLevel(ctx context.Context, tenantID, gradeLevelID uuid.UUID) ([]ClassRef, error)
	// GradeLevelName resolves a grade level's own name (e.g. "Kelas X"),
	// for a grade-level export's "Angkatan: Kelas X" scope line.
	GradeLevelName(ctx context.Context, tenantID, gradeLevelID uuid.UUID) (string, error)
}

// DisciplineReader, GradingReader and PermitsReader each build a complete
// reportdoc.Document in locale (letterhead is filled in by RunDocument,
// not by the reader): title, scope lines, columns and one Section per
// class when scoped to a class or a whole grade level, or a single
// unnamed section when scoped to neither (points/warning letters/leave
// requests scoped to nothing means "every class"). classID and
// gradeLevelID are mutually exclusive; RunDocument guarantees that before
// either reader is called.
type DisciplineReader interface {
	PointTotalRows(ctx context.Context, tenantID uuid.UUID, classID, gradeLevelID uuid.NullUUID, locale string) (reportdoc.Document, error)
	WarningLetterRows(ctx context.Context, tenantID uuid.UUID, classID, gradeLevelID uuid.NullUUID, locale string) (reportdoc.Document, error)
}

type GradingReader interface {
	ReportScoreRows(ctx context.Context, tenantID uuid.UUID, classID, gradeLevelID uuid.NullUUID, subjectID uuid.UUID, termID uuid.NullUUID, locale string) (reportdoc.Document, error)
	// ReportScoreColumns returns the same columns ReportScoreRows would
	// render for this exact scope/subject/term, without the row data --
	// GET /v1/reports/grading.report_scores/columns' backing call, so the
	// web export dialog can offer per-component columns (dynamic per
	// tenant/selection) instead of only a static list.
	ReportScoreColumns(ctx context.Context, tenantID uuid.UUID, classID, gradeLevelID uuid.NullUUID, subjectID uuid.UUID, termID uuid.NullUUID, locale string) ([]reportdoc.Column, error)
}

type PermitsReader interface {
	LeaveRequestRows(ctx context.Context, tenantID uuid.UUID, classID, gradeLevelID uuid.NullUUID, locale string) (reportdoc.Document, error)
	ExitPermitYearlyRows(ctx context.Context, tenantID uuid.UUID, locale string) (reportdoc.Document, error)
}

type Service struct {
	attendance AttendanceReader
	discipline DisciplineReader
	grading    GradingReader
	permits    PermitsReader
	academic   AcademicReader
	letterhead reportdoc.LetterheadSource
	clock      clock.Clock
}

func New(attendance AttendanceReader, discipline DisciplineReader, grading GradingReader, permits PermitsReader, clk clock.Clock) *Service {
	if clk == nil {
		clk = clock.Real{}
	}
	return &Service{attendance: attendance, discipline: discipline, grading: grading, permits: permits, clock: clk}
}

// SetReportDocDependencies wires the reportdoc-backed export path's
// collaborators (attendance's grade-level class resolution, and the
// tenant's letterhead/signature every kind's document uses). Both are
// optional: with academic nil, attendance's grade_level_id export
// returns ErrReportNotFound; with letterhead nil, documents render
// without a kop laporan even when the caller asked for one.
func (s *Service) SetReportDocDependencies(academic AcademicReader, letterhead reportdoc.LetterheadSource) {
	s.academic = academic
	s.letterhead = letterhead
}

// RunArgs carries whatever the caller supplied; the service checks that
// the report's required arguments are present. ClassID and GradeLevelID
// are mutually exclusive (checked by RunDocument before dispatch).
type RunArgs struct {
	ClassID      uuid.NullUUID
	GradeLevelID uuid.NullUUID
	SubjectID    uuid.NullUUID
	TermID       uuid.NullUUID
	Date         *time.Time
}

// RunDocument renders kind per opts (format, title override, letterhead
// visibility, column subset/order/labels) in locale (a platform/i18n-style
// "id"/"en" code -- the tenant's own configured locale, resolved by the
// caller, since a generated document follows the school's language, not
// the requester's Accept-Language) and returns the bytes plus the MIME
// type the transport layer should serve them as. Every catalogue kind
// renders through reportdoc.Document.
func (s *Service) RunDocument(ctx context.Context, tenantID uuid.UUID, kind Kind, args RunArgs, opts reportdoc.Options, locale string) ([]byte, string, error) {
	def, ok := Find(kind)
	if !ok {
		return nil, "", ErrReportNotFound
	}
	if args.ClassID.Valid && args.GradeLevelID.Valid {
		return nil, "", ErrScopeConflict
	}
	if err := requireArgs(def, args); err != nil {
		return nil, "", err
	}

	doc, err := s.document(ctx, tenantID, kind, args, locale)
	if err != nil {
		return nil, "", err
	}
	// attendance.daily's own builder already sets these (its own report
	// date drives PageLabelFormat/EmptyRowsLabel text choices no other
	// kind needs); every other kind gets the same locale-correct default
	// here instead of repeating it in each reader.
	if doc.PageLabelFormat == "" {
		doc.PageLabelFormat = reportdoc.PageLabel(locale)
	}
	if doc.EmptyRowsLabel == "" {
		doc.EmptyRowsLabel = reportdoc.EmptyRowsLabelFor(locale)
	}
	s.attachLetterhead(ctx, tenantID, args, locale, &doc)

	narrowed, err := reportdoc.Apply(doc, opts)
	if err != nil {
		return nil, "", err
	}
	if opts.Format == reportdoc.FormatPDF {
		pdf, err := reportdoc.RenderPDF(narrowed)
		if err != nil {
			return nil, "", err
		}
		return pdf, PDFContentType, nil
	}
	xlsx, err := reportdoc.RenderXLSX(narrowed)
	if err != nil {
		return nil, "", err
	}
	return xlsx, XLSXContentType, nil
}

// attachLetterhead fetches the tenant's configured kop laporan/default
// signature and applies it to doc. When doc already carries a partial
// Signature (a per-class reader set one signer of its own -- the class's
// Wali Kelas -- before returning; see wiring/reports.go's
// classSignature), the tenant's own signer is appended after it instead
// of replacing it, giving a two-signer block: the class's own signer on
// the left, the tenant's default (typically Kepala Sekolah) on the
// right. Signature.Date defaults to today, or the report's own Date
// argument when it has one (attendance.daily).
func (s *Service) attachLetterhead(ctx context.Context, tenantID uuid.UUID, args RunArgs, locale string, doc *reportdoc.Document) {
	if s.letterhead == nil {
		return
	}
	lh, sig, err := s.letterhead.Letterhead(ctx, tenantID)
	if err != nil {
		return
	}
	doc.Letterhead = lh
	if sig == nil {
		return
	}
	when := s.clock.Now()
	if args.Date != nil {
		when = *args.Date
	}
	sig.Date = reportdoc.FormatDate(locale, when)
	if doc.Signature != nil && len(doc.Signature.Signers) > 0 {
		doc.Signature.Place = sig.Place
		doc.Signature.Date = sig.Date
		doc.Signature.Signers = append(doc.Signature.Signers, sig.Signers...)
		return
	}
	doc.Signature = sig
}

// document dispatches to the owning module's reader and assembles the
// reportdoc.Document for kind in locale.
func (s *Service) document(ctx context.Context, tenantID uuid.UUID, kind Kind, args RunArgs, locale string) (reportdoc.Document, error) {
	switch kind {
	case KindAttendanceDaily:
		if s.attendance == nil {
			return reportdoc.Document{}, ErrReportNotFound
		}
		return s.attendanceDocument(ctx, tenantID, args, locale)
	case KindDisciplinePoints:
		if s.discipline == nil {
			return reportdoc.Document{}, ErrReportNotFound
		}
		return s.discipline.PointTotalRows(ctx, tenantID, args.ClassID, args.GradeLevelID, locale)
	case KindWarningLetters:
		if s.discipline == nil {
			return reportdoc.Document{}, ErrReportNotFound
		}
		return s.discipline.WarningLetterRows(ctx, tenantID, args.ClassID, args.GradeLevelID, locale)
	case KindGradingReport:
		if s.grading == nil {
			return reportdoc.Document{}, ErrReportNotFound
		}
		return s.grading.ReportScoreRows(ctx, tenantID, args.ClassID, args.GradeLevelID, args.SubjectID.UUID, args.TermID, locale)
	case KindLeaveRequests:
		if s.permits == nil {
			return reportdoc.Document{}, ErrReportNotFound
		}
		return s.permits.LeaveRequestRows(ctx, tenantID, args.ClassID, args.GradeLevelID, locale)
	case KindExitPermitsYearly:
		if s.permits == nil {
			return reportdoc.Document{}, ErrReportNotFound
		}
		return s.permits.ExitPermitYearlyRows(ctx, tenantID, locale)
	default:
		return reportdoc.Document{}, ErrReportNotFound
	}
}

// Columns returns the columns kind would render for this exact
// scope/subject/term without rendering any rows -- the backing call for
// GET /v1/reports/{reportKind}/columns, used by the web export dialog for
// a report whose columns are not fully static (grading.report_scores'
// per-component columns, discipline.points' per-SP-level columns).
// Static-column kinds never need this endpoint; it still answers for them
// (RunDocument's own reader, minus the row loop) rather than 404ing.
func (s *Service) Columns(ctx context.Context, tenantID uuid.UUID, kind Kind, args RunArgs, locale string) ([]reportdoc.Column, error) {
	def, ok := Find(kind)
	if !ok {
		return nil, ErrReportNotFound
	}
	if args.ClassID.Valid && args.GradeLevelID.Valid {
		return nil, ErrScopeConflict
	}
	if err := requireArgs(def, args); err != nil {
		return nil, err
	}
	if kind == KindGradingReport {
		if s.grading == nil {
			return nil, ErrReportNotFound
		}
		return s.grading.ReportScoreColumns(ctx, tenantID, args.ClassID, args.GradeLevelID, args.SubjectID.UUID, args.TermID, locale)
	}
	doc, err := s.document(ctx, tenantID, kind, args, locale)
	if err != nil {
		return nil, err
	}
	return doc.Columns, nil
}

// attendanceDocument resolves attendance.daily's class(es) (one by id, or
// every class of a grade level via s.academic) and builds one Section per
// class from AttendanceReader.DailyReportTypedRows, translated to locale.
func (s *Service) attendanceDocument(ctx context.Context, tenantID uuid.UUID, args RunArgs, locale string) (reportdoc.Document, error) {
	if !args.ClassID.Valid && !args.GradeLevelID.Valid {
		return reportdoc.Document{}, fmt.Errorf("%w: class_id or grade_level_id", ErrMissingArgument)
	}
	classes, err := s.resolveClasses(ctx, tenantID, args)
	if err != nil {
		return reportdoc.Document{}, err
	}
	statusLabels, err := s.attendance.StatusLabels(ctx, tenantID)
	if err != nil {
		statusLabels = nil // degrade to the special-code fallback text rather than failing the export
	}

	sections := make([]reportdoc.Section, 0, len(classes))
	for _, c := range classes {
		rows, err := s.attendance.DailyReportTypedRows(ctx, tenantID, c.ID, *args.Date)
		if err != nil {
			return reportdoc.Document{}, err
		}
		sections = append(sections, reportdoc.Section{Name: c.Name, Rows: translateAttendanceDailyRows(rows, locale, statusLabels)})
	}

	gradeLevelName := ""
	if args.GradeLevelID.Valid && s.academic != nil {
		gradeLevelName, _ = s.academic.GradeLevelName(ctx, tenantID, args.GradeLevelID.UUID)
	}

	return reportdoc.Document{
		Title:           attendanceDailyText(locale, "title"),
		Scope:           attendanceDailyScope(locale, args, classes, gradeLevelName),
		Columns:         attendanceDailyColumns(locale),
		Sections:        sections,
		PageLabelFormat: reportdoc.PageLabel(locale),
		EmptyRowsLabel:  reportdoc.EmptyRowsLabelFor(locale),
	}, nil
}

// resolveClasses turns args' class_id/grade_level_id scope into the
// class(es) attendanceDocument builds one Section per; a plain class_id
// degrades to a Section named "" (no AcademicReader wired, or the class
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
// AcademicReader wired, or the lookup failed); the scope line then falls
// back to a class count rather than silently disappearing.
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
// same six fields the pre-reportdoc flat export had, now with a stable
// Key, a Kind for reportdoc's typed cells, and a locale-correct Label.
// The Key never changes with locale: Options.Columns (and any saved
// column preference) refers to it.
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
// own such table in wiring/reports.go; reportdoc itself stays free of
// this vocabulary (see its package doc comment).
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

func requireArgs(def Definition, args RunArgs) error {
	for _, arg := range def.Arguments {
		if !arg.Required {
			continue
		}
		switch arg.Kind {
		case ArgClass:
			if !args.ClassID.Valid && !args.GradeLevelID.Valid {
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
