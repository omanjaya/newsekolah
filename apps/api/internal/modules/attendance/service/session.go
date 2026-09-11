package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
	scheduling "github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling"
)

// ListToday returns every session the teacher should see for today: their
// own schedules plus any accepted substitution covering today, each
// opened idempotently (see domain/session.go and
// queries/sessions.sql's OpenAttendanceSession) so the list always carries
// a real session ID the caller can act on next. ScheduleReader does not
// expose period start times, so this is a de-duplicating concatenation of
// the two sources (own schedules first) rather than a time-ordered merge.
func (s *Service) ListToday(ctx context.Context, tenantID, teacherUserID uuid.UUID) ([]SessionSummary, error) {
	var out []SessionSummary
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeAcademicYear(ctx, tenantID)
		if err != nil {
			return err
		}

		loc := s.tenantLocation(ctx, tenantID)
		now := s.clock.Now().In(loc)
		today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
		dayOfWeek := domain.IsoWeekday(now)

		own, err := s.schedules.ListSchedulesForTeacherDay(ctx, tenantID, yearID, teacherUserID, dayOfWeek)
		if err != nil {
			return err
		}
		subs, err := s.schedules.ListAcceptedSubstitutionsForSubstituteDate(ctx, tenantID, teacherUserID, today)
		if err != nil {
			return err
		}

		type occurrence struct {
			schedule     scheduling.ScheduleRef
			isSubstitute bool
		}
		seen := make(map[uuid.UUID]bool, len(own)+len(subs))
		occurrences := make([]occurrence, 0, len(own)+len(subs))
		for _, sched := range own {
			if seen[sched.ID] {
				continue
			}
			seen[sched.ID] = true
			occurrences = append(occurrences, occurrence{schedule: sched})
		}
		for _, sched := range subs {
			if seen[sched.ID] {
				continue
			}
			seen[sched.ID] = true
			occurrences = append(occurrences, occurrence{schedule: sched, isSubstitute: true})
		}

		out = make([]SessionSummary, 0, len(occurrences))
		for _, occ := range occurrences {
			substituteUserID := uuid.NullUUID{}
			if occ.isSubstitute {
				substituteUserID = uuid.NullUUID{UUID: teacherUserID, Valid: true}
			}

			session, _, err := s.repo.OpenSession(ctx, domain.Session{
				TenantID: tenantID, AcademicYearID: yearID, ScheduleID: occ.schedule.ID, Date: today,
				ClassID: occ.schedule.ClassID, SubjectID: occ.schedule.SubjectID, TeacherUserID: occ.schedule.TeacherUserID,
				SubstituteUserID: substituteUserID, StartPeriodID: occ.schedule.StartPeriodID, EndPeriodID: occ.schedule.EndPeriodID,
			})
			if err != nil {
				return err
			}
			out = append(out, SessionSummary{Session: session, IsSubstitute: occ.isSubstitute})
		}
		return nil
	})
	return out, err
}

// OpenSession idempotently opens the session for scheduleID+date (or
// returns the existing one) and returns its full recording payload.
// SubstituteUserID is set on the created row only when actor is not the
// schedule's own teacher, which HasAccess has already confirmed means an
// accepted substitution.
func (s *Service) OpenSession(ctx context.Context, tenantID uuid.UUID, actor Actor, scheduleID uuid.UUID, date time.Time) (SessionDetail, error) {
	var detail SessionDetail
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		schedule, err := s.schedules.GetSchedule(ctx, tenantID, scheduleID)
		if err != nil {
			return err
		}

		ok, err := s.access.HasAccess(ctx, tenantID, scheduleID, actor.UserID, date)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrNoAccess
		}

		substituteUserID := uuid.NullUUID{}
		if actor.UserID != schedule.TeacherUserID {
			substituteUserID = uuid.NullUUID{UUID: actor.UserID, Valid: true}
		}

		session, _, err := s.repo.OpenSession(ctx, domain.Session{
			TenantID: tenantID, AcademicYearID: schedule.AcademicYearID, ScheduleID: scheduleID, Date: date,
			ClassID: schedule.ClassID, SubjectID: schedule.SubjectID, TeacherUserID: schedule.TeacherUserID,
			SubstituteUserID: substituteUserID, StartPeriodID: schedule.StartPeriodID, EndPeriodID: schedule.EndPeriodID,
		})
		if err != nil {
			return err
		}

		policy, err := s.loadStatusPolicy(ctx, tenantID)
		if err != nil {
			return err
		}
		detail, err = s.buildSessionDetail(ctx, tenantID, session, policy)
		return err
	})
	return detail, err
}

// GetSessionDetail reads one session's full recording payload. A caller
// without CanViewAll (a supervisory grant, e.g. view_reports) must be the
// session's own teacher or accepted substitute for that date.
func (s *Service) GetSessionDetail(ctx context.Context, tenantID uuid.UUID, actor Actor, sessionID uuid.UUID) (SessionDetail, error) {
	var detail SessionDetail
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		session, err := s.repo.GetSessionByID(ctx, tenantID, sessionID)
		if err != nil {
			return err
		}

		if !actor.CanViewAll {
			ok, err := s.access.HasAccess(ctx, tenantID, session.ScheduleID, actor.UserID, session.Date)
			if err != nil {
				return err
			}
			if !ok {
				return domain.ErrNoAccess
			}
		}

		policy, err := s.loadStatusPolicy(ctx, tenantID)
		if err != nil {
			return err
		}
		detail, err = s.buildSessionDetail(ctx, tenantID, session, policy)
		return err
	})
	return detail, err
}

// buildSessionDetail assembles the full AttendanceSessionDetail payload:
// meeting number, the previous meeting's journal topic, the roster (with
// each student's previous status, current entry if any, and Blocker
// verdict), and the journal already written for this lesson date, if any.
// Every caller already runs inside a tenant transaction.
//
//nolint:gocyclo // TODO(attendance): split into smaller steps; kept linear for auditability of the rule order
func (s *Service) buildSessionDetail(ctx context.Context, tenantID uuid.UUID, session domain.Session, policy domain.StatusPolicy) (SessionDetail, error) {
	priorCount, err := s.repo.CountSessionsBeforeDate(ctx, tenantID, session.ScheduleID, session.Date)
	if err != nil {
		return SessionDetail{}, err
	}

	var previousJournalTopic string
	if prevSession, found, err := s.repo.GetLatestSessionBeforeDate(ctx, tenantID, session.ScheduleID, session.Date); err != nil {
		return SessionDetail{}, err
	} else if found {
		if journal, jfound, jerr := s.journals.GetJournalForLesson(
			ctx, tenantID, session.AcademicYearID, session.TeacherUserID, session.ClassID, session.SubjectID, prevSession.Date,
		); jerr != nil {
			return SessionDetail{}, jerr
		} else if jfound {
			previousJournalTopic = journal.Topic
		}
	}

	students, err := s.repo.ListActiveEnrollments(ctx, tenantID, session.AcademicYearID, session.ClassID)
	if err != nil {
		return SessionDetail{}, err
	}

	entries, err := s.repo.ListEntriesBySession(ctx, tenantID, session.ID)
	if err != nil {
		return SessionDetail{}, err
	}
	entryByStudent := make(map[uuid.UUID]domain.Entry, len(entries))
	for _, e := range entries {
		entryByStudent[e.StudentUserID] = e
	}

	defaultCode := defaultStatusCode(policy)

	roster := make([]RosterItem, 0, len(students))
	for _, student := range students {
		item := RosterItem{StudentUserID: student.ID, Name: student.Name, CurrentStatus: defaultCode, Source: domain.SourceTeacher}

		if prevStatus, found, err := s.repo.GetPreviousEntryForStudent(
			ctx, tenantID, student.ID, session.ClassID, session.SubjectID, session.Date,
		); err != nil {
			return SessionDetail{}, err
		} else if found {
			item.PreviousStatus = prevStatus
		}

		if entry, ok := entryByStudent[student.ID]; ok {
			item.CurrentStatus = entry.StatusCode
			item.Source = entry.Source
			item.Notes = entry.Notes
		}

		if blocked, reason, err := s.blocker.IsBlocked(ctx, tenantID, student.ID, session.Date); err != nil {
			return SessionDetail{}, err
		} else if blocked {
			item.Blocked = true
			item.BlockedReason = reason
		}

		roster = append(roster, item)
	}

	var journalTopic, journalActivities, journalReflection string
	if journal, found, err := s.journals.GetJournalForLesson(
		ctx, tenantID, session.AcademicYearID, session.TeacherUserID, session.ClassID, session.SubjectID, session.Date,
	); err != nil {
		return SessionDetail{}, err
	} else if found {
		journalTopic, journalActivities, journalReflection = journal.Topic, journal.Activities, journal.Reflection
	}

	return SessionDetail{
		Session: session, IsSubstitute: session.SubstituteUserID.Valid, MeetingNumber: int(priorCount) + 1,
		PreviousJournalTopic: previousJournalTopic, Statuses: policy.Statuses, Roster: roster,
		JournalTopic: journalTopic, JournalActivities: journalActivities, JournalReflection: journalReflection,
	}, nil
}

// saveWindowGrace is the old system's "end_time:59" tolerance
// (teacher_attendance.go L964-967): a period ending exactly on the minute
// still leaves the closing seconds of that minute open to save in.
const saveWindowGrace = 59 * time.Second

// periodEndAt resolves the wall-clock instant a session's last period ends
// on its own date, in the tenant's timezone, plus saveWindowGrace -- the
// input ResolveSaveWindow compares "now" against.
func (s *Service) periodEndAt(ctx context.Context, tenantID uuid.UUID, session domain.Session) (time.Time, error) {
	loc := s.tenantLocation(ctx, tenantID)
	endOfDay, err := s.repo.GetPeriodEndTime(ctx, tenantID, session.EndPeriodID)
	if err != nil {
		return time.Time{}, err
	}
	y, m, d := session.Date.In(loc).Date()
	return time.Date(y, m, d, 0, 0, 0, 0, loc).Add(endOfDay).Add(saveWindowGrace), nil
}
