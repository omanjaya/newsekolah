package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

// RosterStudent is one actively enrolled student's roster row for the
// class roster export: NIS, NISN, name, gender, birth place/date, and
// guardian name when the identity module has one on file.
//
// -- cross-module read; replace with identity reader interface after merge --
type RosterStudent struct {
	StudentUserID uuid.UUID
	Name          string
	NIS           string
	NISN          string
	// Gender is "male", "female", or "" when not recorded.
	Gender       string
	BirthPlace   string
	BirthDate    *time.Time
	GuardianName string
}

// rosterExportRepository reads users/user_profiles/student_profiles
// (owned by the identity module) read-only for the class roster export,
// same convention as studentLookupRepository.
type rosterExportRepository interface {
	ListClassRosterForExport(ctx context.Context, tenantID, classID uuid.UUID) ([]RosterStudent, error)
	// GetUserName resolves a display name for the class roster export's
	// "Wali Kelas" signer (classes.homeroom_teacher_id).
	GetUserName(ctx context.Context, tenantID, userID uuid.UUID) (string, error)
}

// RosterExportQuery is ExportClassRoster's scope: exactly one of
// ClassID/GradeLevelID must be set (the class or grade-level, "angkatan",
// scope every migrated report export shares).
type RosterExportQuery struct {
	ClassID      *uuid.UUID
	GradeLevelID *uuid.UUID
}

// resolveRosterScope turns ClassID/GradeLevelID into the ordered list of
// classes an export covers. Unlike attendance/grading/scheduling's own
// identically shaped helpers, this needs no cross-module read for the
// classes themselves (academic owns classes and grade_levels directly).
func (s *Service) resolveRosterScope(ctx context.Context, tenantID uuid.UUID, classID, gradeLevelID *uuid.UUID) ([]domain.Class, error) {
	if (classID == nil) == (gradeLevelID == nil) {
		return nil, domain.ErrInvalidScope
	}
	if classID != nil {
		class, err := s.repo.GetClassByID(ctx, tenantID, *classID)
		if err != nil {
			return nil, err
		}
		return []domain.Class{class}, nil
	}
	year, found, err := s.repo.GetActiveYear(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, domain.ErrAcademicYearNotFound
	}
	return s.repo.ListClassesByYearAndGradeLevel(ctx, tenantID, year.ID, *gradeLevelID)
}

// rosterScopeLine is the "Kelas: X-1" / "Angkatan: <name>" scope line,
// reusing resolveRosterScope's own result for the class scope so it needs
// no second lookup.
func (s *Service) rosterScopeLine(ctx context.Context, tenantID uuid.UUID, classID, gradeLevelID *uuid.UUID, classes []domain.Class) (reportdoc.ScopeLine, error) {
	if classID != nil && len(classes) > 0 {
		return reportdoc.ScopeLine{Label: "Kelas", Value: classes[0].Name}, nil
	}
	if gradeLevelID != nil {
		grade, err := s.repo.GetGradeLevelByID(ctx, tenantID, *gradeLevelID)
		if err != nil {
			return reportdoc.ScopeLine{}, err
		}
		return reportdoc.ScopeLine{Label: "Angkatan", Value: grade.Name}, nil
	}
	return reportdoc.ScopeLine{}, nil
}

// rosterReportColumns are the class roster export's stable column keys
// and default Indonesian labels: a classic "daftar siswa per kelas/per
// angkatan" printout.
func rosterReportColumns() []reportdoc.Column {
	return []reportdoc.Column{
		{Key: "no", Label: "No", Kind: reportdoc.ColumnNumber, Width: 5},
		{Key: "nis", Label: "NIS", Kind: reportdoc.ColumnText, Width: 14},
		{Key: "nisn", Label: "NISN", Kind: reportdoc.ColumnText, Width: 14},
		{Key: "name", Label: "Nama Siswa", Kind: reportdoc.ColumnText, Width: 28},
		{Key: "gender", Label: "Jenis Kelamin", Kind: reportdoc.ColumnText, Width: 14},
		{Key: "birth_place", Label: "Tempat Lahir", Kind: reportdoc.ColumnText, Width: 18},
		{Key: "birth_date", Label: "Tanggal Lahir", Kind: reportdoc.ColumnDate, Width: 14},
		{Key: "guardian_name", Label: "Nama Wali", Kind: reportdoc.ColumnText, Width: 24},
	}
}

// genderLabel is code's Indonesian display text ("Laki-laki"/
// "Perempuan"), never the raw "male"/"female" a downloaded report's
// reader cannot be expected to decode. An unrecorded gender renders as a
// blank cell rather than a placeholder string.
func genderLabel(code string) string {
	switch code {
	case "male":
		return "Laki-laki"
	case "female":
		return "Perempuan"
	default:
		return ""
	}
}

// rosterReportSection turns one class's roster into a reportdoc Section,
// ordered to match rosterReportColumns.
func rosterReportSection(name string, students []RosterStudent) reportdoc.Section {
	rows := make([][]any, len(students))
	for i, st := range students {
		var birthDate any
		if st.BirthDate != nil {
			birthDate = *st.BirthDate
		}
		rows[i] = []any{i + 1, st.NIS, st.NISN, st.Name, genderLabel(st.Gender), st.BirthPlace, birthDate, st.GuardianName}
	}
	return reportdoc.Section{Name: name, Rows: rows}
}

// classSignature builds the roster export's Signature block: the
// tenant's configured default (reportLetterhead's own result), with the
// class's currently assigned homeroom teacher prepended as "Wali Kelas"
// -- reportdoc renders multiple Signers side by side, left to right, so
// the homeroom teacher lands on the left and the tenant's own default
// signer(s) on the right. A grade-level export (many classes, one shared
// Signature) or a class with no homeroom teacher assigned keeps base
// unchanged.
func (s *Service) classSignature(ctx context.Context, tenantID uuid.UUID, classes []domain.Class, base *reportdoc.Signature) *reportdoc.Signature {
	if len(classes) != 1 || base == nil || classes[0].HomeroomTeacherID == nil {
		return base
	}
	name, err := s.repo.GetUserName(ctx, tenantID, *classes[0].HomeroomTeacherID)
	if err != nil || name == "" {
		return base
	}
	signature := *base
	signature.Signers = append([]reportdoc.Signer{{RoleLabel: "Wali Kelas", Name: name}}, base.Signers...)
	return &signature
}

// ExportClassRoster renders the actively enrolled students of one class
// or every class of a grade level ("angkatan") as a reportdoc file (XLSX
// or PDF per opts.Format) -- one section per class, a classic "daftar
// siswa per kelas/per angkatan" printout. locale (reportdoc.LocaleID/
// LocaleEN) drives every reportdoc-provided piece of text (the PDF
// page-number footer, the "no rows" label); report-specific text
// (title, scope labels, column labels) stays Indonesian, this module's
// own default. Called with a zero reportdoc.Options, this keeps every
// existing caller's request working: xlsx, every column, the report's
// own default title.
func (s *Service) ExportClassRoster(ctx context.Context, tenantID uuid.UUID, q RosterExportQuery, locale string, opts reportdoc.Options) ([]byte, error) {
	var out []byte
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		classes, err := s.resolveRosterScope(ctx, tenantID, q.ClassID, q.GradeLevelID)
		if err != nil {
			return err
		}
		scopeLine, err := s.rosterScopeLine(ctx, tenantID, q.ClassID, q.GradeLevelID, classes)
		if err != nil {
			return err
		}

		sections := make([]reportdoc.Section, len(classes))
		for i, class := range classes {
			students, err := s.repo.ListClassRosterForExport(ctx, tenantID, class.ID)
			if err != nil {
				return err
			}
			sections[i] = rosterReportSection(class.Name, students)
		}

		doc := reportdoc.Document{
			Title:           "Daftar Siswa",
			Scope:           []reportdoc.ScopeLine{scopeLine},
			Columns:         rosterReportColumns(),
			Sections:        sections,
			PageLabelFormat: reportdoc.PageLabel(locale),
			EmptyRowsLabel:  reportdoc.EmptyRowsLabelFor(locale),
		}
		if opts.ShowLetterhead {
			lh, sig, err := s.reportLetterhead(ctx, tenantID)
			if err != nil {
				return err
			}
			doc.Letterhead = lh
			doc.Signature = s.classSignature(ctx, tenantID, classes, sig)
		}

		applied, err := reportdoc.Apply(doc, opts)
		if err != nil {
			return err
		}
		if opts.Format == reportdoc.FormatPDF {
			out, err = reportdoc.RenderPDF(applied)
		} else {
			out, err = reportdoc.RenderXLSX(applied)
		}
		return err
	})
	return out, err
}
