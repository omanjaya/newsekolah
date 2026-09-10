package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/billing/domain"
)

// ArrearsReport is what the finance office reviews: every student who
// still owes money this year, and the same totals rolled up per class.
type ArrearsReport struct {
	ByStudent []domain.ArrearsLine
	ByClass   []domain.ClassArrears
}

func (s *Service) ArrearsReport(ctx context.Context, tenantID uuid.UUID) (ArrearsReport, error) {
	if err := s.guard(ctx, tenantID); err != nil {
		return ArrearsReport{}, err
	}
	var report ArrearsReport
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		bills, err := s.repo.ListOutstandingBills(ctx, tenantID, yearID)
		if err != nil {
			return err
		}
		enrollments, err := s.repo.ListActiveEnrollments(ctx, tenantID, yearID)
		if err != nil {
			return err
		}
		classOf := make(map[uuid.UUID]uuid.NullUUID, len(enrollments))
		for _, e := range enrollments {
			classOf[e.StudentUserID] = e.ClassID
		}
		report.ByStudent = domain.ArrearsByStudent(bills, classOf)
		report.ByClass = domain.ArrearsByClass(report.ByStudent)
		return nil
	})
	return report, err
}
