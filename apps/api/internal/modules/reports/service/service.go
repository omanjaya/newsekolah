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
		{KindGradingReport, "manage_grades", []Argument{{"class_id", ArgClass, true}, {"grade_level_id", ArgGradeLevel, false}, {"subject_id", ArgSubject, true}, {"term_id", ArgTerm, false}}},
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
// (int/string/time.Time, not stringified) for RunDocument's
// reportdoc.Document.
type AttendanceReader interface {
	DailyReportTypedRows(ctx context.Context, tenantID, classID uuid.UUID, date time.Time) ([][]any, error)
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
// grade-level-scoped export. The other catalogue kinds resolve their own
// scope internally (see wiring/reports.go's resolveScope) since their
// column sets vary by scope in ways this generic shape does not capture
// (e.g. grading.report_scores' per-component columns).
type AcademicReader interface {
	ClassByID(ctx context.Context, tenantID, classID uuid.UUID) (ClassRef, error)
	ClassesInGradeLevel(ctx context.Context, tenantID, gradeLevelID uuid.UUID) ([]ClassRef, error)
}

// DisciplineReader, GradingReader and PermitsReader each build a complete
// reportdoc.Document (letterhead is filled in by RunDocument, not by the
// reader): title, scope lines, columns and one Section per class when
// scoped to a class or a whole grade level, or a single unnamed section
// when scoped to neither (points/warning letters/leave requests scoped to
// nothing means "every class"). classID and gradeLevelID are mutually
// exclusive; RunDocument guarantees that before either reader is called.
type DisciplineReader interface {
	PointTotalRows(ctx context.Context, tenantID uuid.UUID, classID, gradeLevelID uuid.NullUUID) (reportdoc.Document, error)
	WarningLetterRows(ctx context.Context, tenantID uuid.UUID, classID, gradeLevelID uuid.NullUUID) (reportdoc.Document, error)
}

type GradingReader interface {
	ReportScoreRows(ctx context.Context, tenantID uuid.UUID, classID, gradeLevelID uuid.NullUUID, subjectID uuid.UUID, termID uuid.NullUUID) (reportdoc.Document, error)
}

type PermitsReader interface {
	LeaveRequestRows(ctx context.Context, tenantID uuid.UUID, classID, gradeLevelID uuid.NullUUID) (reportdoc.Document, error)
	ExitPermitYearlyRows(ctx context.Context, tenantID uuid.UUID) (reportdoc.Document, error)
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
// visibility, column subset/order/labels) and returns the bytes plus the
// MIME type the transport layer should serve them as. Every catalogue
// kind renders through reportdoc.Document.
func (s *Service) RunDocument(ctx context.Context, tenantID uuid.UUID, kind Kind, args RunArgs, opts reportdoc.Options) ([]byte, string, error) {
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

	doc, err := s.document(ctx, tenantID, kind, args)
	if err != nil {
		return nil, "", err
	}
	if s.letterhead != nil {
		if lh, sig, err := s.letterhead.Letterhead(ctx, tenantID); err == nil {
			doc.Letterhead = lh
			doc.Signature = sig
		}
	}
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

// document dispatches to the owning module's reader and assembles the
// reportdoc.Document for kind (letterhead/signature are attached by
// RunDocument, not here, so every kind gets them the same way).
func (s *Service) document(ctx context.Context, tenantID uuid.UUID, kind Kind, args RunArgs) (reportdoc.Document, error) {
	switch kind {
	case KindAttendanceDaily:
		if s.attendance == nil {
			return reportdoc.Document{}, ErrReportNotFound
		}
		return s.attendanceDocument(ctx, tenantID, args)
	case KindDisciplinePoints:
		if s.discipline == nil {
			return reportdoc.Document{}, ErrReportNotFound
		}
		return s.discipline.PointTotalRows(ctx, tenantID, args.ClassID, args.GradeLevelID)
	case KindWarningLetters:
		if s.discipline == nil {
			return reportdoc.Document{}, ErrReportNotFound
		}
		return s.discipline.WarningLetterRows(ctx, tenantID, args.ClassID, args.GradeLevelID)
	case KindGradingReport:
		if s.grading == nil {
			return reportdoc.Document{}, ErrReportNotFound
		}
		return s.grading.ReportScoreRows(ctx, tenantID, args.ClassID, args.GradeLevelID, args.SubjectID.UUID, args.TermID)
	case KindLeaveRequests:
		if s.permits == nil {
			return reportdoc.Document{}, ErrReportNotFound
		}
		return s.permits.LeaveRequestRows(ctx, tenantID, args.ClassID, args.GradeLevelID)
	case KindExitPermitsYearly:
		if s.permits == nil {
			return reportdoc.Document{}, ErrReportNotFound
		}
		return s.permits.ExitPermitYearlyRows(ctx, tenantID)
	default:
		return reportdoc.Document{}, ErrReportNotFound
	}
}

// attendanceDocument resolves attendance.daily's class(es) (one by id, or
// every class of a grade level via s.academic) and builds one Section per
// class from AttendanceReader.DailyReportTypedRows.
func (s *Service) attendanceDocument(ctx context.Context, tenantID uuid.UUID, args RunArgs) (reportdoc.Document, error) {
	if !args.ClassID.Valid && !args.GradeLevelID.Valid {
		return reportdoc.Document{}, fmt.Errorf("%w: class_id or grade_level_id", ErrMissingArgument)
	}
	classes, err := s.resolveClasses(ctx, tenantID, args)
	if err != nil {
		return reportdoc.Document{}, err
	}

	sections := make([]reportdoc.Section, 0, len(classes))
	for _, c := range classes {
		rows, err := s.attendance.DailyReportTypedRows(ctx, tenantID, c.ID, *args.Date)
		if err != nil {
			return reportdoc.Document{}, err
		}
		sections = append(sections, reportdoc.Section{Name: c.Name, Rows: rows})
	}

	doc := reportdoc.Document{
		Title:           "Attendance Daily Report",
		Scope:           attendanceDailyScope(args, classes),
		Columns:         attendanceDailyColumns(),
		Sections:        sections,
		PageLabelFormat: "Page {page} of {pages}",
	}
	if doc.Signature != nil && args.Date != nil {
		doc.Signature.Date = args.Date.Format("2006-01-02")
	}
	return doc, nil
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

// attendanceDailyScope builds the "Class: X-1" / "Grade Level: X" /
// "Date: 2026-09-01" lines describing what this export covers.
func attendanceDailyScope(args RunArgs, classes []ClassRef) []reportdoc.ScopeLine {
	var scope []reportdoc.ScopeLine
	switch {
	case args.GradeLevelID.Valid:
		scope = append(scope, reportdoc.ScopeLine{Label: "Grade Level", Value: fmt.Sprintf("%d classes", len(classes))})
	case len(classes) == 1:
		scope = append(scope, reportdoc.ScopeLine{Label: "Class", Value: classes[0].Name})
	}
	if args.Date != nil {
		scope = append(scope, reportdoc.ScopeLine{Label: "Date", Value: args.Date.Format("2006-01-02")})
	}
	return scope
}

// attendanceDailyColumns is attendance.daily's full column set -- the
// same six fields the pre-reportdoc flat export had, now with a stable
// Key and a Kind for reportdoc's typed cells.
func attendanceDailyColumns() []reportdoc.Column {
	return []reportdoc.Column{
		{Key: "no", Label: "No", Kind: reportdoc.ColumnNumber, Width: 5},
		{Key: "name", Label: "Name", Kind: reportdoc.ColumnText, Width: 28},
		{Key: "status", Label: "Status", Kind: reportdoc.ColumnText, Width: 12},
		{Key: "expected_sessions", Label: "Expected Sessions", Kind: reportdoc.ColumnNumber, Width: 14},
		{Key: "submitted_sessions", Label: "Submitted Sessions", Kind: reportdoc.ColumnNumber, Width: 14},
		{Key: "complete", Label: "Complete", Kind: reportdoc.ColumnText, Width: 10},
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
