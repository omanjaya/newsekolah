package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/mentoring/domain"
)

// StudentSnapshot combines what the platform already knows about one
// student -- attendance, discipline points, published grades, and the
// activities record (achievements, clubs) -- read
// through adapters over those modules, never by mentoring querying their
// tables directly. An id the tenant has no student for (no such user, or
// a staff member or administrator) is domain.ErrStudentNotFound (a 404),
// not a server error or a snapshot of someone who is not a student. A guru
// wali (no school-wide read) only reaches the students of a group they
// mentor this year; anyone else's is domain.ErrGroupForbidden.
func (s *Service) StudentSnapshot(ctx context.Context, tenantID uuid.UUID, viewer domain.Viewer, studentUserID uuid.UUID) (domain.StudentSnapshot, error) {
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
		if err := s.requireMentorOf(ctx, tenantID, yearID, viewer, studentUserID); err != nil {
			return err
		}
		out = domain.StudentSnapshot{StudentUserID: studentUserID, StudentName: info.Name, ClassName: info.ClassName}

		// "This month" is the school's own month: 23:30 UTC on 31
		// October is already 1 November in Asia/Makassar.
		month := s.tenantNow(ctx, tenantID).Format("2006-01")
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
		if s.activities != nil {
			achievements, err := s.activities.StudentAchievements(ctx, tenantID, studentUserID)
			if err != nil {
				return err
			}
			clubs, err := s.activities.StudentClubs(ctx, tenantID, studentUserID)
			if err != nil {
				return err
			}
			out.Achievements, out.Clubs = achievements, clubs
		}
		return nil
	})
	return out, err
}

// requireMentorOf lets a school-wide reader through and otherwise demands
// that the student sits in a group the viewer mentors this year.
func (s *Service) requireMentorOf(ctx context.Context, tenantID, yearID uuid.UUID, viewer domain.Viewer, studentUserID uuid.UUID) error {
	if viewer.ReadAll || viewer.WriteAll {
		return nil
	}
	member, found, err := s.repo.FindMembershipForStudent(ctx, tenantID, yearID, studentUserID)
	if err != nil {
		return err
	}
	if !found {
		return domain.ErrGroupForbidden
	}
	group, ok, err := s.repo.GetGroup(ctx, tenantID, member.GroupID)
	if err != nil {
		return err
	}
	if !ok || !viewer.CanRead(group) {
		return domain.ErrGroupForbidden
	}
	return nil
}
