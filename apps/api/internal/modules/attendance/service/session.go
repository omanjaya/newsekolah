package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
	scheduling "github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

// ListSessionsOptions narrows ListSessions: Date defaults to today (in the
// tenant's timezone) when nil, and CurrentOnly restricts the result to
// occurrences whose period is running right now, mirroring the old
// system's "?date=" and "currentOnly" query parameters
// (docs/analysis/backend-inventory.md section 1.9, teacher_attendance.go
// L350-364/390-394).
type ListSessionsOptions struct {
	Date        *time.Time
	CurrentOnly bool
}

// ListSessions returns every session teacherUserID should see for
// opts.Date: their own schedules plus any accepted substitution covering
// that date. A lesson today or earlier is opened idempotently (see
// domain/session.go and queries/sessions.sql's OpenAttendanceSession) so
// its row carries a real session ID the caller can act on next; a lesson on
// a later day is listed without being opened (listedSession). Returns an empty list
// outright on a day the tenant does not hold school
// (docs/analysis/backend-inventory.md section 1.9, L361-364), a case the
// merge logic below would otherwise silently treat as "no schedules
// today" -- functionally the same result, but this way a caller does not
// have to open sessions for a normal school day. ScheduleReader does not
// expose period start times for a time-ordered merge, so this is a
// de-duplicating concatenation of the two sources (own schedules first).
func (s *Service) ListSessions(ctx context.Context, tenantID, teacherUserID uuid.UUID, opts ListSessionsOptions) ([]SessionSummary, error) {
	day, err := s.ListDay(ctx, tenantID, teacherUserID, opts)
	return day.Sessions, err
}

// ListDay is ListSessions plus the name of the calendar event that
// cancelled the day's lessons, if any. A lesson whose class has no school
// that date (a holiday, no-school day or semester break for its grade
// level) is left out instead of being opened; one of the teacher's own
// lessons that an accepted substitution hands to someone else is kept but
// marked HandedOverTo, and its session records that substitute.
//
//nolint:gocyclo // sequential guard clauses and a merge of three sources, not nested decision logic.
func (s *Service) ListDay(ctx context.Context, tenantID, teacherUserID uuid.UUID, opts ListSessionsOptions) (DaySessions, error) {
	day := DaySessions{Sessions: []SessionSummary{}}
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeAcademicYear(ctx, tenantID)
		if err != nil {
			return err
		}

		loc := s.tenantLocation(ctx, tenantID)
		now := clock.Now(ctx, s.clock).In(loc)
		date := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
		if opts.Date != nil {
			y, m, d := opts.Date.Date()
			date = time.Date(y, m, d, 0, 0, 0, 0, loc)
		}
		// A lesson on a later day is listed, never opened: browsing next
		// week must not write a session row (see listedSession).
		future := domain.SessionNotStarted(date, now)

		// The version of each lesson in effect that date: a timetable
		// changed from a later date still lists the old lesson here.
		own, err := s.schedules.ListSchedulesForTeacherOn(ctx, tenantID, yearID, teacherUserID, date)
		if err != nil {
			return err
		}
		subs, err := s.schedules.ListAcceptedSubstitutionsForSubstituteDate(ctx, tenantID, teacherUserID, date)
		if err != nil {
			return err
		}
		handOvers, err := s.schedules.ListHandOversForTeacherDate(ctx, tenantID, teacherUserID, date)
		if err != nil {
			return err
		}
		handedTo := make(map[uuid.UUID]uuid.UUID, len(handOvers))
		for _, h := range handOvers {
			handedTo[h.ScheduleID] = h.SubstituteUserID
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

		for _, occ := range occurrences {
			teaching, eventName, err := s.teachingDay(ctx, tenantID, yearID, occ.schedule.ClassID, date)
			if err != nil {
				return err
			}
			if !teaching {
				if day.HolidayName == "" {
					day.HolidayName = eventName
				}
				continue
			}
			if opts.CurrentOnly {
				current, err := s.periodIsRunning(ctx, tenantID, occ.schedule.StartPeriodID, occ.schedule.EndPeriodID, now)
				if err != nil {
					return err
				}
				if !current {
					continue
				}
			}

			substituteUserID := uuid.NullUUID{}
			handedOverTo := uuid.NullUUID{}
			switch {
			case occ.isSubstitute:
				substituteUserID = uuid.NullUUID{UUID: teacherUserID, Valid: true}
			default:
				if to, ok := handedTo[occ.schedule.ID]; ok {
					handedOverTo = uuid.NullUUID{UUID: to, Valid: true}
					substituteUserID = handedOverTo
				}
			}

			occurrence := domain.Session{
				TenantID: tenantID, AcademicYearID: yearID, ScheduleID: occ.schedule.ID, Date: date,
				ClassID: occ.schedule.ClassID, SubjectID: occ.schedule.SubjectID, TeacherUserID: occ.schedule.TeacherUserID,
				SubstituteUserID: substituteUserID, StartPeriodID: occ.schedule.StartPeriodID, EndPeriodID: occ.schedule.EndPeriodID,
			}
			session, err := s.listedSession(ctx, occurrence, future)
			if err != nil {
				return err
			}

			students, err := s.repo.ListActiveEnrollments(ctx, tenantID, yearID, occ.schedule.ClassID)
			if err != nil {
				return err
			}
			var entries []domain.Entry
			if session.ID != uuid.Nil {
				entries, err = s.repo.ListEntriesBySession(ctx, tenantID, session.ID)
				if err != nil {
					return err
				}
			}
			startsAt, err := s.periodStartAt(ctx, tenantID, session)
			if err != nil {
				return err
			}

			day.Sessions = append(day.Sessions, SessionSummary{
				Session: session, IsSubstitute: occ.isSubstitute,
				RosterCount: len(students), EnteredCount: countEnrolledEntries(entries, students),
				HandedOverTo: handedOverTo, StartsAt: startsAt,
			})
		}
		return nil
	})
	return day, err
}

// listedSession is the session a list row stands for. A lesson today or
// earlier is opened idempotently, so the row carries a real session ID the
// caller can act on next. A lesson on a later day is only looked up: it
// cannot be recorded yet, and opening it would write a placeholder row for
// a lesson that has not happened -- one the scheduling module would have
// to tell apart from history. With no session yet, the occurrence comes
// back as is, with no ID.
func (s *Service) listedSession(ctx context.Context, occurrence domain.Session, future bool) (domain.Session, error) {
	if !future {
		session, _, err := s.repo.OpenSession(ctx, occurrence)
		return session, err
	}
	existing, found, err := s.repo.GetSessionBySchedule(ctx, occurrence.TenantID, occurrence.ScheduleID, occurrence.Date)
	if err != nil || found {
		return existing, err
	}
	return occurrence, nil
}

// requireLessonDay refuses a session dated after the school's today
// (attendance is recorded on the day, not ahead of it) or on a date the
// academic calendar cancels lessons for classID.
func (s *Service) requireLessonDay(ctx context.Context, tenantID, academicYearID, classID uuid.UUID, date time.Time) error {
	now := clock.Now(ctx, s.clock).In(s.tenantLocation(ctx, tenantID))
	if domain.SessionNotStarted(date, now) {
		return domain.ErrSessionNotStarted
	}
	teaching, _, err := s.teachingDay(ctx, tenantID, academicYearID, classID, date)
	if err != nil {
		return err
	}
	if !teaching {
		return domain.ErrNotSchoolDay
	}
	return nil
}

// canCorrectClass reports whether actor may open a session for classID
// under SaveModeCorrection: a global corrector always may; the class's own
// homeroom teacher may, for their class only. date is the session's own
// date, the same business date the homeroom scope check runs against.
func (s *Service) canCorrectClass(ctx context.Context, tenantID uuid.UUID, actor Actor, academicYearID, classID uuid.UUID, date time.Time) (bool, error) {
	if actor.IsGlobalCorrector {
		return true, nil
	}
	homeroomClassID, hasHomeroom, err := s.repo.GetHomeroomClassForTeacher(ctx, tenantID, academicYearID, actor.UserID, date)
	if err != nil {
		return false, err
	}
	return hasHomeroom && homeroomClassID == classID, nil
}

// periodIsRunning reports whether now falls within [start, end] of a
// schedule occurrence's periods, on now's own date and in the tenant's
// timezone -- the "currentOnly" filter.
func (s *Service) periodIsRunning(ctx context.Context, tenantID uuid.UUID, startPeriodID, endPeriodID uuid.UUID, now time.Time) (bool, error) {
	startOfDay, err := s.repo.GetPeriodStartTime(ctx, tenantID, startPeriodID)
	if err != nil {
		return false, err
	}
	endOfDay, err := s.repo.GetPeriodEndTime(ctx, tenantID, endPeriodID)
	if err != nil {
		return false, err
	}
	y, m, d := now.Date()
	dayStart := time.Date(y, m, d, 0, 0, 0, 0, now.Location())
	startAt, endAt := dayStart.Add(startOfDay), dayStart.Add(endOfDay)
	return !now.Before(startAt) && !now.After(endAt), nil
}

// OpenSession idempotently opens the session for scheduleID+date (or
// returns the existing one) and returns its full recording payload.
// SubstituteUserID is set on the created row only when actor is not the
// schedule's own teacher, which HasAccess has already confirmed means an
// accepted substitution. mode=SaveModeCorrection additionally lets a
// global corrector or the schedule class's homeroom teacher open a
// session neither taught nor substituted for, mirroring the old system's
// "?mode=correction" (docs/analysis/backend-inventory.md section 1.9,
// teacher_attendance.go L411-415): without it, a corrector could only ever
// open a session the original teacher had already opened first.
func (s *Service) OpenSession(ctx context.Context, tenantID uuid.UUID, actor Actor, scheduleID uuid.UUID, date time.Time, mode domain.SaveMode) (SessionDetail, error) {
	var detail SessionDetail
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		// A lesson on a later day has not happened yet: opening it would
		// create a placeholder session nothing can be recorded in.
		today := clock.Now(ctx, s.clock).In(s.tenantLocation(ctx, tenantID)).Format(time.DateOnly)
		if date.Format(time.DateOnly) > today {
			return domain.ErrSessionNotStarted
		}

		schedule, err := s.schedules.GetSchedule(ctx, tenantID, scheduleID)
		if err != nil {
			return err
		}
		// A version only takes place on the dates it is in effect: after a
		// change, the lesson that date is another version (the day list
		// already offers that one). An earlier date stays correctable.
		if !schedule.EffectiveOn(date) {
			return domain.ErrLessonNotOnDate
		}
		if err := s.requireLessonDay(ctx, tenantID, schedule.AcademicYearID, schedule.ClassID, date); err != nil {
			return err
		}

		isSubstitute, err := s.access.HasAccess(ctx, tenantID, scheduleID, actor.UserID, date)
		if err != nil {
			return err
		}
		isSubstitute = isSubstitute && actor.UserID != schedule.TeacherUserID
		ok := isSubstitute || actor.UserID == schedule.TeacherUserID
		if !ok && mode == domain.SaveModeCorrection {
			ok, err = s.canCorrectClass(ctx, tenantID, actor, schedule.AcademicYearID, schedule.ClassID, date)
			if err != nil {
				return err
			}
		}
		if !ok {
			return domain.ErrNoAccess
		}

		substituteUserID := uuid.NullUUID{}
		if isSubstitute {
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
		if err != nil {
			return err
		}
		window, handedOverTo, err := s.saveWindowInput(ctx, tenantID, actor, session)
		if err != nil {
			return err
		}
		detail.SaveMode, detail.EditableUntil = viewerSaveMode(window)
		detail.HandedOverTo = handedOverTo
		return nil
	})
	return detail, err
}

// GetSessionDetail reads one session's full recording payload. A caller
// without CanViewAll (a supervisory grant, e.g. view_reports) must be the
// session's own teacher or accepted substitute for that date -- or the
// lesson's own teacher after handing it to a substitute, who may still
// look at it but no longer saves it.
func (s *Service) GetSessionDetail(ctx context.Context, tenantID uuid.UUID, actor Actor, sessionID uuid.UUID) (SessionDetail, error) {
	var detail SessionDetail
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		session, err := s.repo.GetSessionByID(ctx, tenantID, sessionID)
		if err != nil {
			return err
		}

		window, handedOverTo, err := s.saveWindowInput(ctx, tenantID, actor, session)
		if err != nil {
			return err
		}
		saveMode, editableUntil := viewerSaveMode(window)
		if !actor.CanViewAll && saveMode != domain.SaveModeNormal && !handedOverTo.Valid {
			return domain.ErrNoAccess
		}

		policy, err := s.loadStatusPolicy(ctx, tenantID)
		if err != nil {
			return err
		}
		detail, err = s.buildSessionDetail(ctx, tenantID, session, policy)
		detail.SaveMode, detail.EditableUntil = saveMode, editableUntil
		detail.HandedOverTo = handedOverTo
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
	// The meeting number counts this class and subject's earlier lessons
	// that were actually held, whichever weekday's schedule row they came
	// from; the previous topic is the last journal written for them.
	priorCount, err := s.repo.CountHeldMeetingsBeforeDate(ctx, tenantID, session.AcademicYearID, session.ClassID, session.SubjectID, session.Date)
	if err != nil {
		return SessionDetail{}, err
	}

	var previousJournalTopic string
	if journal, found, err := s.journals.GetLatestJournalBefore(
		ctx, tenantID, session.AcademicYearID, session.ClassID, session.SubjectID, session.Date,
	); err != nil {
		return SessionDetail{}, err
	} else if found {
		previousJournalTopic = journal.Topic
	}

	startsAt, err := s.periodStartAt(ctx, tenantID, session)
	if err != nil {
		return SessionDetail{}, err
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

	studentIDs := make([]uuid.UUID, len(students))
	for i, student := range students {
		studentIDs[i] = student.ID
	}
	yearCounts, err := s.repo.CountEntryStatusesForStudentsInYear(ctx, tenantID, session.AcademicYearID, studentIDs)
	if err != nil {
		return SessionDetail{}, err
	}
	yearCountsByStudent := make(map[uuid.UUID]map[string]int, len(students))
	for _, c := range yearCounts {
		if yearCountsByStudent[c.StudentUserID] == nil {
			yearCountsByStudent[c.StudentUserID] = make(map[string]int)
		}
		yearCountsByStudent[c.StudentUserID][c.StatusCode] = c.Total
	}

	defaultCode := defaultStatusCode(policy)

	roster := make([]RosterItem, 0, len(students))
	for _, student := range students {
		item := RosterItem{
			StudentUserID: student.ID, Name: student.Name, NIS: student.NIS,
			YearCounts: yearCountsByStudent[student.ID], CurrentStatus: defaultCode, Source: domain.SourceTeacher,
		}

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

		// An issued leave letter or exit permit decides the day's status
		// whatever is picked here (SaveEntries applies the same Override),
		// so the row says so up front instead of looking editable.
		if code, source, ok, err := s.overrider.Override(ctx, tenantID, student.ID, session.Date); err != nil {
			return SessionDetail{}, err
		} else if ok {
			item.CurrentStatus, item.Source, item.Locked = code, source, true
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
		StartsAt: startsAt,
	}, nil
}

// countEnrolledEntries counts the entries recorded for students still on
// the class roster: an entry kept for someone who has since left the
// class is history, not progress, so "filled" can never exceed the roster
// or look complete while a current student is still unrecorded.
func countEnrolledEntries(entries []domain.Entry, students []StudentRef) int {
	enrolled := make(map[uuid.UUID]struct{}, len(students))
	for _, st := range students {
		enrolled[st.ID] = struct{}{}
	}
	n := 0
	for _, e := range entries {
		if _, ok := enrolled[e.StudentUserID]; ok {
			n++
		}
	}
	return n
}

// periodStartAt resolves the wall-clock instant a session's first period
// starts on its own date, in the tenant's timezone: nothing can be
// recorded for the lesson before it.
func (s *Service) periodStartAt(ctx context.Context, tenantID uuid.UUID, session domain.Session) (time.Time, error) {
	loc := s.tenantLocation(ctx, tenantID)
	start, err := s.repo.GetPeriodStartTime(ctx, tenantID, session.StartPeriodID)
	if err != nil {
		return time.Time{}, err
	}
	y, m, d := session.Date.Date()
	return time.Date(y, m, d, 0, 0, 0, 0, loc).Add(start), nil
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
	// The DATE's own fields name the day (it arrives as midnight UTC);
	// converting it first would move it back a day west of UTC.
	y, m, d := session.Date.Date()
	return time.Date(y, m, d, 0, 0, 0, 0, loc).Add(endOfDay).Add(saveWindowGrace), nil
}
