package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/activities/domain"
)

func (s *Service) CreateMeeting(ctx context.Context, tenantID, clubID uuid.UUID, meetingDate time.Time, notes string) (domain.Meeting, error) {
	if meetingDate.IsZero() {
		return domain.Meeting{}, domain.ErrInvalidInput
	}
	var out domain.Meeting
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if _, ok, err := s.repo.GetExtracurricular(ctx, tenantID, clubID); err != nil {
			return err
		} else if !ok {
			return domain.ErrClubNotFound
		}
		var err error
		out, err = s.repo.CreateMeeting(ctx, domain.Meeting{TenantID: tenantID, ExtracurricularID: clubID, MeetingDate: meetingDate, Notes: notes})
		return err
	})
	return out, err
}

func (s *Service) ListMeetings(ctx context.Context, tenantID, clubID uuid.UUID) ([]domain.Meeting, error) {
	var out []domain.Meeting
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListMeetingsForClub(ctx, tenantID, clubID)
		return err
	})
	return out, err
}

// MeetingRoster is a meeting's active members alongside any attendance
// already recorded for them, for the take-attendance screen.
type MeetingRoster struct {
	Meeting domain.Meeting
	Entries []domain.AttendanceEntry
}

func (s *Service) MeetingRosterFor(ctx context.Context, tenantID, meetingID uuid.UUID) (MeetingRoster, error) {
	var out MeetingRoster
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		meeting, ok, err := s.repo.GetMeeting(ctx, tenantID, meetingID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrMeetingNotFound
		}
		out.Meeting = meeting
		out.Entries, err = s.repo.ListAttendanceForMeeting(ctx, tenantID, meetingID)
		return err
	})
	return out, err
}

// RecordAttendance sets one student's status for a meeting, only for a
// student who currently holds (or held) a membership in the club --
// attendance for a stranger to the club is a data-entry mistake, not a
// legitimate record.
func (s *Service) RecordAttendance(ctx context.Context, tenantID uuid.UUID, meetingID, studentID uuid.UUID, status domain.AttendanceStatus, notes string, recordedBy uuid.UUID) (domain.AttendanceEntry, error) {
	if !status.Valid() {
		return domain.AttendanceEntry{}, domain.ErrInvalidInput
	}
	var out domain.AttendanceEntry
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		meeting, ok, err := s.repo.GetMeeting(ctx, tenantID, meetingID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrMeetingNotFound
		}
		memberIDs, err := s.repo.ListActiveMemberStudentIDs(ctx, tenantID, meeting.ExtracurricularID)
		if err != nil {
			return err
		}
		isMember := false
		for _, id := range memberIDs {
			if id == studentID {
				isMember = true
				break
			}
		}
		if !isMember {
			if _, ok, err := s.repo.GetActiveMembership(ctx, tenantID, meeting.ExtracurricularID, studentID); err != nil {
				return err
			} else if !ok {
				return domain.ErrNotAMember
			}
		}
		out, err = s.repo.UpsertAttendance(ctx, domain.AttendanceEntry{
			TenantID: tenantID, MeetingID: meetingID, StudentUserID: studentID, StatusCode: status, Notes: notes,
			RecordedBy: uuid.NullUUID{UUID: recordedBy, Valid: true},
		})
		return err
	})
	return out, err
}

// AttendanceReport lists every recorded status across every meeting of a
// club, for the per-club attendance report.
func (s *Service) AttendanceReport(ctx context.Context, tenantID, clubID uuid.UUID) ([]domain.AttendanceEntry, error) {
	var out []domain.AttendanceEntry
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListAttendanceForClub(ctx, tenantID, clubID)
		return err
	})
	return out, err
}
