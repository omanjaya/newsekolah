package service

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// IsActiveTeacherInYear reports whether userID holds an active teaching
// assignment in academicYearID -- the transport layer uses this (alongside
// StudentActiveClassID) to decide how to scope a schedule-read request for
// a caller who holds neither manage_schedules, view_reports, nor
// manage_attendance.
func (s *Service) IsActiveTeacherInYear(ctx context.Context, tenantID, academicYearID, userID uuid.UUID) (bool, error) {
	var ok bool
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		ok, err = s.repo.IsActiveTeacher(ctx, tenantID, academicYearID, userID)
		return err
	})
	return ok, err
}

// StudentActiveClassID resolves the class a student is actively enrolled
// in for academicYearID (found=false when they have none this year).
func (s *Service) StudentActiveClassID(ctx context.Context, tenantID, academicYearID, studentID uuid.UUID) (uuid.UUID, bool, error) {
	var (
		classID uuid.UUID
		found   bool
	)
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		classID, found, err = s.repo.GetStudentActiveClassID(ctx, tenantID, academicYearID, studentID)
		return err
	})
	return classID, found, err
}

// ListTeacherOptions lists active teachers with a teaching assignment in
// academicYearID, for a schedule form's teacher dropdown. Pass a valid
// selfUserID to narrow to one teacher (the caller's own id, when they
// don't hold manage_schedules/manage_master_data); an invalid one lists
// everyone.
func (s *Service) ListTeacherOptions(ctx context.Context, tenantID, academicYearID uuid.UUID, search string, selfUserID uuid.NullUUID, limit int32) ([]UserRef, error) {
	var out []UserRef
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListTeacherOptions(ctx, tenantID, academicYearID, search, selfUserID, limit)
		return err
	})
	return out, err
}

// HasAccess implements scheduling.AccessChecker: true for the schedule's
// own teacher, true for a teacher holding an accepted substitution for
// that exact schedule and date.
func (s *Service) HasAccess(ctx context.Context, tenantID, scheduleID, userID uuid.UUID, date time.Time) (bool, error) {
	var allowed bool
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		sched, err := s.repo.GetScheduleByID(ctx, tenantID, scheduleID)
		if err != nil {
			return err
		}
		if sched.TeacherUserID == userID {
			allowed = true
			return nil
		}
		_, ok, err := s.repo.GetAcceptedSubstitutionForScheduleDate(ctx, tenantID, scheduleID, userID, date)
		if err != nil {
			return err
		}
		allowed = ok
		return nil
	})
	return allowed, err
}
