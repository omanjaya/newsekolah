package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

// resolveReportScope turns a report export's class_id/grade_level_id
// query parameters (exactly one must be set) into the ordered list of
// classes it covers: a single class for the class scope, or every class
// of the tenant's active academic year under gradeLevelID for the
// grade-level ("angkatan") scope, ordered by name so a multi-class export
// always lists its sections the same way.
func (s *Service) resolveReportScope(ctx context.Context, tenantID uuid.UUID, classID, gradeLevelID *uuid.UUID) ([]ClassRef, error) {
	if (classID == nil) == (gradeLevelID == nil) {
		return nil, domain.ErrInvalidScope
	}
	if classID != nil {
		name, err := s.repo.GetClassName(ctx, tenantID, *classID)
		if err != nil {
			return nil, err
		}
		return []ClassRef{{ID: *classID, Name: name}}, nil
	}
	yearID, err := s.activeAcademicYear(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	classes, err := s.repo.ListClassesByGradeLevel(ctx, tenantID, yearID, *gradeLevelID)
	if err != nil {
		return nil, err
	}
	return classes, nil
}

// reportScopeLine is the "Kelas: X-1" / "Angkatan: <name>" scope line a
// report export prints under its title, so a downloaded file is
// self-describing about which scope it covers without the screen it came
// from. classes is resolveReportScope's own result, reused here so the
// class scope needs no second lookup.
func (s *Service) reportScopeLine(ctx context.Context, tenantID uuid.UUID, classID, gradeLevelID *uuid.UUID, classes []ClassRef) (reportdoc.ScopeLine, error) {
	if classID != nil && len(classes) > 0 {
		return reportdoc.ScopeLine{Label: "Kelas", Value: classes[0].Name}, nil
	}
	if gradeLevelID != nil {
		name, err := s.repo.GetGradeLevelName(ctx, tenantID, *gradeLevelID)
		if err != nil {
			return reportdoc.ScopeLine{}, err
		}
		return reportdoc.ScopeLine{Label: "Angkatan", Value: name}, nil
	}
	return reportdoc.ScopeLine{}, nil
}

// classSignature builds a report's Signature block: the tenant's
// configured default (reportLetterhead's own result), with a class-scoped
// export's currently assigned homeroom teacher prepended as "Wali Kelas"
// -- reportdoc renders multiple Signers side by side, left to right, so
// the homeroom teacher lands on the left and the tenant's own default
// signer(s) on the right. A grade-level export (classID nil) or a class
// with no homeroom teacher assigned keeps base unchanged.
func (s *Service) classSignature(ctx context.Context, tenantID uuid.UUID, classID *uuid.UUID, base *reportdoc.Signature) *reportdoc.Signature {
	if classID == nil || base == nil {
		return base
	}
	teacherID, ok, err := s.repo.GetClassHomeroomTeacher(ctx, tenantID, *classID)
	if err != nil || !ok {
		return base
	}
	name, err := s.repo.GetUserName(ctx, tenantID, teacherID)
	if err != nil || name == "" {
		return base
	}
	signature := *base
	signature.Signers = append([]reportdoc.Signer{{RoleLabel: "Wali Kelas", Name: name}}, base.Signers...)
	return &signature
}

// renderReport is every attendance report export's last step: narrow doc
// per opts (Apply), then render it as opts.Format picks (an empty/zero
// Format defaults to XLSX, reportdoc.Options' own documented default).
func renderReport(doc reportdoc.Document, opts reportdoc.Options) ([]byte, error) {
	applied, err := reportdoc.Apply(doc, opts)
	if err != nil {
		return nil, err
	}
	if opts.Format == reportdoc.FormatPDF {
		return reportdoc.RenderPDF(applied)
	}
	return reportdoc.RenderXLSX(applied)
}
