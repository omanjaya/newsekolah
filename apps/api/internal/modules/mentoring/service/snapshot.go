package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/mentoring/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

// StudentSnapshot combines what the platform already knows about one
// student -- attendance, discipline points, and published grades -- read
// through adapters over those modules, never by mentoring querying their
// tables directly. An id the tenant has no student for (no such user, or
// a staff member or administrator) is domain.ErrStudentNotFound (a 404),
// not a server error or a snapshot of someone who is not a student.
func (s *Service) StudentSnapshot(ctx context.Context, tenantID, studentUserID uuid.UUID) (domain.StudentSnapshot, error) {
	var out domain.StudentSnapshot
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.requireEnabled(ctx, tenantID); err != nil {
			return err
		}
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		info, err := s.repo.StudentInfo(ctx, tenantID, yearID, studentUserID)
		if err != nil {
			return err
		}
		out = domain.StudentSnapshot{StudentUserID: studentUserID, StudentName: info.Name, ClassName: info.ClassName}

		month := clock.Now(ctx, s.clock).Format("2006-01")
		if s.attendance != nil {
			counts, err := s.attendance.MonthlyStatusCounts(ctx, tenantID, studentUserID, month)
			if err != nil {
				return err
			}
			out.AttendanceByStatus = counts
		}
		if s.discipline != nil {
			points, active, err := s.discipline.StudentPoints(ctx, tenantID, studentUserID)
			if err != nil {
				return err
			}
			out.DisciplinePoints, out.DisciplineActiveCount = points, active
		}
		if s.grading != nil {
			subjects, err := s.grading.PublishedSubjects(ctx, tenantID, studentUserID)
			if err != nil {
				return err
			}
			out.PublishedSubjects = subjects
		}
		return nil
	})
	return out, err
}
