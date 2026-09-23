package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
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
		return []ClassRef{{ID: *classID}}, nil
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
