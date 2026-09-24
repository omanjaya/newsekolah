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
	"github.com/xuri/excelize/v2"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
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
// are mutually exclusive, enforced by Run.
type ArgumentKind string

const (
	ArgClass   ArgumentKind = "class"
	ArgSubject ArgumentKind = "subject"
	ArgDate    ArgumentKind = "date"
	ArgTerm    ArgumentKind = "term"
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
		{KindAttendanceDaily, "view_reports", []Argument{{"class_id", ArgClass, true}, {"date", ArgDate, true}}},
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

// Sheet is attendance.daily's legacy rendered shape: one line of a
// workbook plus its header row. The other catalogue kinds render through
// reportdoc.Document instead (see the Discipline/Grading/Permits reader
// interfaces below); Sheet stays only until attendance.daily migrates the
// same way.
type Sheet struct {
	Title   string
	Headers []string
	Rows    [][]any
}

// Readers are the per-module data sources the wiring layer supplies.
type AttendanceReader interface {
	DailyReportRows(ctx context.Context, tenantID, classID uuid.UUID, date time.Time) (Sheet, error)
}

// DisciplineReader, GradingReader and PermitsReader each build a complete
// reportdoc.Document (letterhead is filled in by Run, not by the reader):
// title, scope lines, columns and one Section per class when scoped to a
// class or a whole grade level, or a single unnamed section when scoped
// to neither (points/warning letters/leave requests scoped to nothing
// means "every class"). classID and gradeLevelID are mutually exclusive;
// Run guarantees that before either reader is called.
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

// LetterheadReader resolves a tenant's configured kop laporan (letterhead
// image/text lines) and default signature block, so every exported
// document -- interactive or scheduled -- looks the same regardless of
// which report kind produced it. Nil (or an implementation returning no
// letterhead) simply omits it: Apply already treats a nil
// Document.Letterhead as "print none".
type LetterheadReader interface {
	TenantLetterhead(ctx context.Context, tenantID uuid.UUID) (*reportdoc.Letterhead, *reportdoc.Signature, error)
}

type Service struct {
	attendance AttendanceReader
	discipline DisciplineReader
	grading    GradingReader
	permits    PermitsReader
	letterhead LetterheadReader
}

func New(attendance AttendanceReader, discipline DisciplineReader, grading GradingReader, permits PermitsReader, letterhead LetterheadReader) *Service {
	return &Service{attendance: attendance, discipline: discipline, grading: grading, permits: permits, letterhead: letterhead}
}

// RunArgs carries whatever the caller supplied; the service checks that
// the report's required arguments are present. ClassID and GradeLevelID
// are mutually exclusive (checked by Run before dispatch).
type RunArgs struct {
	ClassID      uuid.NullUUID
	GradeLevelID uuid.NullUUID
	SubjectID    uuid.NullUUID
	TermID       uuid.NullUUID
	Date         *time.Time
}

// Run renders one report per opts (format, title override, letterhead
// visibility, column subset) and returns the bytes plus the MIME type the
// transport layer should serve them as.
func (s *Service) Run(ctx context.Context, tenantID uuid.UUID, kind Kind, args RunArgs, opts reportdoc.Options) ([]byte, string, error) {
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

	if kind == KindAttendanceDaily {
		if args.GradeLevelID.Valid {
			// Grade-level scope for attendance.daily migrates alongside
			// its own reportdoc integration; until then a grade-level-only
			// request has no class_id to run against.
			return nil, "", fmt.Errorf("%w: grade_level scope for attendance.daily is not available yet", ErrMissingArgument)
		}
		sheet, err := s.sheet(ctx, tenantID, kind, args)
		if err != nil {
			return nil, "", err
		}
		xlsx, err := renderXLSX(sheet)
		if err != nil {
			return nil, "", err
		}
		return xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", nil
	}

	doc, err := s.document(ctx, tenantID, kind, args)
	if err != nil {
		return nil, "", err
	}
	doc.Letterhead, doc.Signature = s.letterheadFor(ctx, tenantID, opts)
	narrowed, err := reportdoc.Apply(doc, opts)
	if err != nil {
		return nil, "", err
	}
	switch opts.Format {
	case reportdoc.FormatPDF:
		pdf, err := reportdoc.RenderPDF(narrowed)
		if err != nil {
			return nil, "", err
		}
		return pdf, "application/pdf", nil
	default:
		xlsx, err := reportdoc.RenderXLSX(narrowed)
		if err != nil {
			return nil, "", err
		}
		return xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", nil
	}
}

// letterheadFor resolves the tenant's letterhead when opts asked to show
// one and a reader is wired; either condition failing means no
// letterhead, never an error -- a report with no configured letterhead
// still downloads.
func (s *Service) letterheadFor(ctx context.Context, tenantID uuid.UUID, opts reportdoc.Options) (*reportdoc.Letterhead, *reportdoc.Signature) {
	if !opts.ShowLetterhead || s.letterhead == nil {
		return nil, nil
	}
	lh, sig, err := s.letterhead.TenantLetterhead(ctx, tenantID)
	if err != nil {
		return nil, nil
	}
	return lh, sig
}

func (s *Service) sheet(ctx context.Context, tenantID uuid.UUID, kind Kind, args RunArgs) (Sheet, error) {
	switch kind {
	case KindAttendanceDaily:
		if s.attendance == nil {
			return Sheet{}, ErrReportNotFound
		}
		return s.attendance.DailyReportRows(ctx, tenantID, args.ClassID.UUID, *args.Date)
	default:
		return Sheet{}, ErrReportNotFound
	}
}

// document dispatches to the owning module's reader for every kind
// except attendance.daily (still Sheet-based, see sheet above).
func (s *Service) document(ctx context.Context, tenantID uuid.UUID, kind Kind, args RunArgs) (reportdoc.Document, error) {
	switch kind {
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

// renderXLSX writes one sheet with a header row and the data below it --
// attendance.daily's legacy path (see Sheet's doc comment).
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
