package service

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
	scheduling "github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling"
)

// defaultCorrectionDays is used when a tenant has never set
// attendance.correction_days: a full week is enough for a homeroom teacher
// or global corrector to catch a missed entry without leaving the window
// open indefinitely.
const defaultCorrectionDays = 7

// SaveEntries validates and saves a batch of student statuses (and,
// optionally, the lesson journal) for one session, per
// docs/analysis/backend-inventory.md section 1.9: who may save in which
// mode, the save/correction windows, and materializing the daily summary
// for every affected student in the same transaction.
//
//nolint:gocyclo // TODO(attendance): split into smaller steps; kept linear for auditability of the rule order
func (s *Service) SaveEntries(ctx context.Context, tenantID uuid.UUID, actor Actor, sessionID uuid.UUID, in SaveEntriesInput) (SessionDetail, error) {
	mode := in.Mode
	if mode == "" {
		mode = domain.SaveModeNormal
	}

	var detail SessionDetail
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		session, err := s.repo.GetSessionByID(ctx, tenantID, sessionID)
		if err != nil {
			return err
		}

		accessOK, err := s.access.HasAccess(ctx, tenantID, session.ScheduleID, actor.UserID, session.Date)
		if err != nil {
			return err
		}

		homeroomClassID, hasHomeroom, err := s.repo.GetHomeroomClassForTeacher(ctx, tenantID, session.AcademicYearID, actor.UserID)
		if err != nil {
			return err
		}
		isHomeroom := hasHomeroom && homeroomClassID == session.ClassID

		switch mode {
		case domain.SaveModeCorrection:
			if !actor.IsGlobalCorrector && !isHomeroom {
				return domain.ErrCorrectionNotAllowed
			}
			if strings.TrimSpace(in.Reason) == "" {
				return domain.ErrCorrectionReasonRequired
			}
		default:
			if !accessOK {
				return domain.ErrNoAccess
			}
		}

		periodEnd, err := s.periodEndAt(ctx, tenantID, session)
		if err != nil {
			return err
		}
		correctionDays, configured, err := s.repo.GetCorrectionDays(ctx, tenantID)
		if err != nil {
			return err
		}
		if !configured {
			correctionDays = defaultCorrectionDays
		}

		loc := s.tenantLocation(ctx, tenantID)
		if err := domain.ResolveSaveWindow(domain.SaveWindowInput{
			Now: s.clock.Now().In(loc), SessionDate: session.Date, PeriodEndAt: periodEnd, CorrectionDays: correctionDays,
			IsGlobalCorrector: actor.IsGlobalCorrector, IsHomeroomOfClass: isHomeroom, IsScheduleOwner: accessOK,
		}, mode); err != nil {
			return err
		}

		policy, err := s.loadStatusPolicy(ctx, tenantID)
		if err != nil {
			return err
		}

		enrollments, err := s.repo.ListActiveEnrollments(ctx, tenantID, session.AcademicYearID, session.ClassID)
		if err != nil {
			return err
		}
		enrolled := make(map[uuid.UUID]bool, len(enrollments))
		for _, e := range enrollments {
			enrolled[e.ID] = true
		}

		wasSubmitted := session.IsSubmitted()
		affected := make([]uuid.UUID, 0, len(in.Entries))
		var guardianIDs []uuid.UUID

		// A student whose late-arrival workflow is still open is skipped
		// silently -- not rejected outright -- so a batch save for the
		// rest of the class still goes through; the caller sees who was
		// skipped via SkippedBlockedStudentIDs. Mirrors the old system's
		// "siswa dengan terlambat belum selesai dilewati" rule
		// (docs/analysis/backend-inventory.md section 1.9), which this
		// rebuild had stopped enforcing at save time. The blocked verdict
		// is resolved once per student up front so domain.PartitionBlocked
		// can decide who to skip as a pure function.
		blockedByStudent := make(map[uuid.UUID]bool, len(in.Entries))
		studentIDs := make([]uuid.UUID, len(in.Entries))
		for i, entryIn := range in.Entries {
			studentIDs[i] = entryIn.StudentUserID
			if _, ok := blockedByStudent[entryIn.StudentUserID]; ok {
				continue
			}
			blocked, _, err := s.blocker.IsBlocked(ctx, tenantID, entryIn.StudentUserID, session.Date)
			if err != nil {
				return err
			}
			blockedByStudent[entryIn.StudentUserID] = blocked
		}
		skippedBlocked := domain.PartitionBlocked(studentIDs, func(id uuid.UUID) bool { return blockedByStudent[id] })
		skipSet := make(map[uuid.UUID]bool, len(skippedBlocked))
		for _, id := range skippedBlocked {
			skipSet[id] = true
		}

		for _, entryIn := range in.Entries {
			if !enrolled[entryIn.StudentUserID] {
				return domain.ErrStudentNotInClass
			}
			if skipSet[entryIn.StudentUserID] {
				continue
			}

			if !policy.IsValid(entryIn.StatusCode) {
				return domain.ErrInvalidStatusCode
			}

			statusCode := entryIn.StatusCode
			source := domain.SourceTeacher
			if overrideCode, overrideSource, ok, err := s.overrider.Override(ctx, tenantID, entryIn.StudentUserID, session.Date); err != nil {
				return err
			} else if ok {
				statusCode, source = overrideCode, overrideSource
			}

			existing, found, err := s.repo.GetEntryBySessionStudent(ctx, tenantID, sessionID, entryIn.StudentUserID)
			if err != nil {
				return err
			}

			saved, err := s.repo.UpsertEntry(ctx, domain.Entry{
				TenantID: tenantID, SessionID: sessionID, StudentUserID: entryIn.StudentUserID, StatusCode: statusCode,
				Source: source, Notes: entryIn.Notes, RecordedBy: uuid.NullUUID{UUID: actor.UserID, Valid: true},
			})
			if err != nil {
				return err
			}

			if wasSubmitted && found && existing.StatusCode != statusCode {
				if _, err := s.repo.CreateCorrection(ctx, domain.Correction{
					TenantID: tenantID, EntryID: saved.ID, OldStatus: existing.StatusCode, NewStatus: statusCode,
					Reason: in.Reason, CorrectedBy: actor.UserID,
				}); err != nil {
					return err
				}
			}

			// Per-session violations replace whatever was previously
			// recorded against this session for the student (delete-then-
			// reinsert, docs/analysis/backend-inventory.md section 1.9),
			// even when the list is now empty.
			if err := s.violations.ReplaceSessionViolations(
				ctx, tenantID, sessionID, entryIn.StudentUserID, entryIn.ViolationIDs, session.Date, actor.UserID,
			); err != nil {
				return err
			}

			if statusCode == domain.StatusCodeAlpha {
				ids, err := s.repo.ListGuardianUserIDs(ctx, tenantID, entryIn.StudentUserID)
				if err != nil {
					return err
				}
				guardianIDs = append(guardianIDs, ids...)
			}

			affected = append(affected, entryIn.StudentUserID)
		}

		if in.Journal != nil {
			if strings.TrimSpace(in.Journal.Topic) == "" || strings.TrimSpace(in.Journal.Activities) == "" {
				return domain.ErrJournalRequired
			}
			if _, err := s.journals.UpsertJournal(ctx, tenantID, session.TeacherUserID, actor.UserID, scheduling.JournalInput{
				AcademicYearID: session.AcademicYearID, ClassID: session.ClassID, SubjectID: session.SubjectID, LessonDate: session.Date,
				Topic: in.Journal.Topic, Activities: in.Journal.Activities, Reflection: in.Journal.Reflection,
			}); err != nil {
				return err
			}
		}

		session, err = s.repo.SubmitSession(ctx, tenantID, sessionID, actor.UserID, session.Notes)
		if err != nil {
			return err
		}

		if err := s.recomputeDailySummaryForClassDate(ctx, tenantID, session.AcademicYearID, session.ClassID, session.Date, affected, policy); err != nil {
			return err
		}

		detail, err = s.buildSessionDetail(ctx, tenantID, session, policy)
		if err != nil {
			return err
		}
		detail.SkippedBlockedStudentIDs = skippedBlocked

		if s.events != nil {
			_ = s.events.Publish(ctx, Submitted{
				TenantID: tenantID, SessionID: session.ID, ScheduleID: session.ScheduleID, ClassID: session.ClassID,
				Date: session.Date, SubmittedBy: actor.UserID, StudentCount: len(affected), GuardianUserIDs: guardianIDs,
			})
		}
		return nil
	})
	if err != nil {
		return SessionDetail{}, err
	}

	if s.realtime != nil {
		_ = s.realtime.PublishMonitor(tenantID, MonitorUpdate{
			ClassID: detail.Session.ClassID, SessionID: detail.Session.ID, SubmittedAt: detail.Session.SubmittedAt,
		})
	}
	return detail, nil
}

// recomputeDailySummaryForClassDate materializes attendance_daily_summary
// for the given students on date: expected/submitted sessions are the same
// for every student in the class (a session covers the whole class, not
// one student), so both are computed once and only each student's own
// recorded statuses vary.
func (s *Service) recomputeDailySummaryForClassDate(
	ctx context.Context, tenantID, academicYearID, classID uuid.UUID, date time.Time, studentIDs []uuid.UUID, policy domain.StatusPolicy,
) error {
	dayOfWeek := domain.IsoWeekday(date)
	isSchoolDay, err := s.repo.IsSchoolDay(ctx, tenantID, academicYearID, dayOfWeek)
	if err != nil {
		return err
	}

	expected := 0
	if isSchoolDay {
		count, err := s.schedules.CountSchedulesForClassDay(ctx, tenantID, academicYearID, classID, dayOfWeek)
		if err != nil {
			return err
		}
		expected = int(count)
	}

	submittedCount, err := s.repo.CountSubmittedSessionsByClassDate(ctx, tenantID, classID, date)
	if err != nil {
		return err
	}
	submitted := int(submittedCount)

	for _, studentID := range studentIDs {
		statuses, err := s.repo.ListEntryStatusesForStudentDate(ctx, tenantID, studentID, date)
		if err != nil {
			return err
		}
		result := domain.ComputeDailyStatus(expected, submitted, statuses, policy)
		if err := s.repo.UpsertDailySummary(ctx, tenantID, academicYearID, studentID, date, result.StatusCode, result.Expected, result.Submitted); err != nil {
			return err
		}
	}
	return nil
}
