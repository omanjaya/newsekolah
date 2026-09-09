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
)

var (
	ErrReportNotFound  = errors.New("report not found")
	ErrMissingArgument = errors.New("report argument missing or invalid")
)

// Kind identifies one report in the catalogue.
type Kind string

const (
	KindAttendanceDaily  Kind = "attendance.daily"
	KindDisciplinePoints Kind = "discipline.points"
	KindWarningLetters   Kind = "discipline.warning_letters"
	KindGradingReport    Kind = "grading.report_scores"
	KindLeaveRequests    Kind = "permits.leave_requests"
)

// ArgumentKind tells the UI which control to render for a parameter.
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
}

type Service struct {
	attendance AttendanceReader
	discipline DisciplineReader
	grading    GradingReader
	permits    PermitsReader
}

func New(attendance AttendanceReader, discipline DisciplineReader, grading GradingReader, permits PermitsReader) *Service {
	return &Service{attendance: attendance, discipline: discipline, grading: grading, permits: permits}
}

// RunArgs carries whatever the caller supplied; the service checks that
// the report's required arguments are present.
type RunArgs struct {
	ClassID   uuid.NullUUID
	SubjectID uuid.NullUUID
	TermID    uuid.NullUUID
	Date      *time.Time
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
