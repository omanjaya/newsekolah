package service

import (
	"context"
	"errors"
	"slices"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/audit"
)

// EventPublisher is the narrow slice of platform/events.Bus the service
// needs. Declared here (the consumer) mirrors identity/service's pattern
// for auth.TokenIssuer/RateLimiter, but events.Event is trivial enough
// (one method) that this package imports it directly rather than
// redeclaring an equivalent type.
type EventPublisher interface {
	Publish(ctx context.Context, evt Event) error
}

// Event is the method set platform/events.Event requires; declared here so
// this package's exported event types satisfy both without importing
// platform/events for anything but this one interface at the module.go
// wiring boundary.
type Event interface {
	EventName() string
}

// SubstitutionRequested and SubstitutionResponded are published on the
// platform bus, where wiring/eventbridge.go translates them into the
// notification-facing events.Envelope.
type SubstitutionRequested struct {
	TenantID         uuid.UUID
	SubstitutionID   uuid.UUID
	ScheduleID       uuid.UUID
	Date             time.Time
	RequesterUserID  uuid.UUID
	SubstituteUserID uuid.UUID
}

// EventName is this module's own routing key and deliberately differs from
// platform/events.SubstitutionRequested ("substitution.requested"), the
// Envelope name notifications consumes: sharing one name delivered the
// bridge's Envelope back to the bridge's typed subscriber, which panicked
// after the request had committed (attendance/service/events.go's
// Submitted.EventName follows the same rule).
func (SubstitutionRequested) EventName() string { return "scheduling.substitution.requested" }

type SubstitutionResponded struct {
	TenantID         uuid.UUID
	SubstitutionID   uuid.UUID
	ScheduleID       uuid.UUID
	Date             time.Time
	RequesterUserID  uuid.UUID
	SubstituteUserID uuid.UUID
	Accepted         bool
}

// EventName deliberately differs from platform/events.SubstitutionResponded
// ("substitution.responded"), the Envelope name notifications consumes; see
// SubstitutionRequested.EventName's comment for why the two must not match.
func (SubstitutionResponded) EventName() string { return "scheduling.substitution.responded" }

// SubstitutionCancelled is published when a pending or accepted request is
// withdrawn, by its requester or by a schedule manager (ByManager) freeing
// the lesson for a timetable change; the bridge tells whichever of the two
// teachers did not cancel it.
type SubstitutionCancelled struct {
	TenantID         uuid.UUID
	SubstitutionID   uuid.UUID
	ScheduleID       uuid.UUID
	Date             time.Time
	RequesterUserID  uuid.UUID
	SubstituteUserID uuid.UUID
	CancelledBy      uuid.UUID
	ByManager        bool
	// WasAccepted is true when the substitute had already agreed to stand in.
	WasAccepted bool
}

// EventName deliberately differs from platform/events.SubstitutionCancelled
// ("substitution.cancelled"); see SubstitutionRequested.EventName.
func (SubstitutionCancelled) EventName() string { return "scheduling.substitution.cancelled" }

// RequestSubstitution validates and creates a substitution request. Only
// the schedule's own teacher (or an admin acting for them) may request one;
// the transport layer passes requesterUserID as the schedule's teacher when
// it authorizes the call, so the service just double-checks it matches.
func (s *Service) RequestSubstitution(
	ctx context.Context, tenantID uuid.UUID, scheduleID uuid.UUID, date time.Time,
	requesterUserID, substituteUserID uuid.UUID, note string, publisher EventPublisher,
) (domain.Substitution, error) {
	var created domain.Substitution
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		sched, err := s.repo.GetScheduleByID(ctx, tenantID, scheduleID)
		if err != nil {
			return domain.ErrScheduleNotFound
		}
		if sched.TeacherUserID != requesterUserID {
			return domain.ErrTeacherEditForbidden
		}
		// The request stays with this version; it must be the one on the
		// timetable that day (a later change made another version).
		if !sched.EffectiveOn(date) {
			return domain.ErrSubstitutionNotScheduled
		}

		if err := domain.ValidateNewSubstitution(requesterUserID, substituteUserID, sched.DayOfWeek, date, s.now(ctx)); err != nil {
			return err
		}
		if s.calendar != nil {
			teaching, _, err := s.calendar.IsTeachingDay(ctx, tenantID, sched.AcademicYearID, sched.ClassID, date)
			if err != nil {
				return err
			}
			if !teaching {
				return domain.ErrSubstitutionNotSchoolDay
			}
		}

		if _, ok, err := s.repo.GetActiveSubstitutionForScheduleDate(ctx, tenantID, scheduleID, date); err != nil {
			return err
		} else if ok {
			return domain.ErrSubstitutionDuplicateActive
		}

		// The substitute need not already teach this exact class/subject
		// (docs/analysis/backend-inventory.md section 1.13 only requires
		// "pengganti guru aktif di tahun aktif" -- an active teacher this
		// year, not necessarily of this class); IsActiveTeacher checks
		// that broader condition.
		if ok, err := s.repo.IsActiveTeacher(ctx, tenantID, sched.AcademicYearID, substituteUserID); err != nil || !ok {
			return domain.ErrSubstituteNotTeacher
		}

		created, err = s.repo.CreateSubstitution(ctx, domain.Substitution{
			TenantID: tenantID, AcademicYearID: sched.AcademicYearID, ScheduleID: scheduleID, Date: date,
			RequesterUserID: requesterUserID, SubstituteUserID: substituteUserID, RequesterNote: note,
		})
		if errors.Is(mapConstraintError(err), domain.ErrScheduleEnded) {
			return domain.ErrSubstitutionNotScheduled
		}
		return err
	})
	if err != nil {
		return domain.Substitution{}, err
	}

	_ = publisher.Publish(ctx, SubstitutionRequested{
		TenantID: tenantID, SubstitutionID: created.ID, ScheduleID: scheduleID, Date: date,
		RequesterUserID: requesterUserID, SubstituteUserID: substituteUserID,
	})
	return created, nil
}

func (s *Service) RespondSubstitution(ctx context.Context, tenantID, id, responderUserID uuid.UUID, accept bool, note string, publisher EventPublisher) (domain.Substitution, error) {
	var updated domain.Substitution
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		existing, err := s.repo.GetSubstitutionByID(ctx, tenantID, id)
		if err != nil {
			return domain.ErrSubstitutionNotFound
		}
		if err := existing.CanRespond(responderUserID); err != nil {
			return err
		}

		status := domain.SubstitutionRejected
		if accept {
			status = domain.SubstitutionAccepted
		}
		updated, err = s.repo.RespondSubstitution(ctx, tenantID, id, status, note)
		return err
	})
	if err != nil {
		return domain.Substitution{}, err
	}

	_ = publisher.Publish(ctx, SubstitutionResponded{
		TenantID: tenantID, SubstitutionID: updated.ID, ScheduleID: updated.ScheduleID, Date: updated.Date,
		RequesterUserID: updated.RequesterUserID, SubstituteUserID: updated.SubstituteUserID, Accepted: accept,
	})
	return updated, nil
}

// CancelSubstitution withdraws a pending or accepted request. Its requester
// may always do so; a schedule manager (actor.CanManage) may cancel anyone's
// dated today or later, which is how they release a request that holds a
// timetable change back (MutationPolicy.HeldBy); one already past is
// refused (domain.ErrSubstitutionCancelPast). A manager's cancellation of
// someone else's request is written to the audit log, and both teachers
// are told of a cancellation they did not make themselves.
func (s *Service) CancelSubstitution(ctx context.Context, tenantID, id uuid.UUID, actor Actor, publisher EventPublisher) (domain.Substitution, error) {
	var existing, updated domain.Substitution
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		existing, err = s.repo.GetSubstitutionByID(ctx, tenantID, id)
		if err != nil {
			return domain.ErrSubstitutionNotFound
		}
		if err := existing.CanCancel(actor.UserID, actor.CanManage, s.now(ctx)); err != nil {
			return err
		}
		updated, err = s.repo.CancelSubstitution(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if actor.UserID == existing.RequesterUserID {
			return nil
		}
		return audit.Record(ctx, tenantID, "substitution_request.cancel", "substitution_request", id,
			substitutionAudit(existing), substitutionAudit(updated))
	})
	if err != nil {
		return domain.Substitution{}, err
	}
	if publisher == nil {
		return updated, nil
	}

	_ = publisher.Publish(ctx, SubstitutionCancelled{
		TenantID: tenantID, SubstitutionID: updated.ID, ScheduleID: updated.ScheduleID, Date: updated.Date,
		RequesterUserID: updated.RequesterUserID, SubstituteUserID: updated.SubstituteUserID,
		CancelledBy: actor.UserID, ByManager: actor.UserID != existing.RequesterUserID,
		WasAccepted: existing.Status == domain.SubstitutionAccepted,
	})
	return updated, nil
}

// substitutionAuditEntry is what the audit log keeps of a request: which
// lesson and date, between whom, and its status.
type substitutionAuditEntry struct {
	ScheduleID       uuid.UUID `json:"schedule_id"`
	Date             string    `json:"date"`
	RequesterUserID  uuid.UUID `json:"requester_user_id"`
	SubstituteUserID uuid.UUID `json:"substitute_user_id"`
	Status           string    `json:"status"`
}

func substitutionAudit(s domain.Substitution) substitutionAuditEntry {
	return substitutionAuditEntry{
		ScheduleID: s.ScheduleID, Date: s.Date.Format(time.DateOnly),
		RequesterUserID: s.RequesterUserID, SubstituteUserID: s.SubstituteUserID, Status: string(s.Status),
	}
}

func (s *Service) ListSubstitutionsIncoming(ctx context.Context, tenantID, userID uuid.UUID) ([]domain.Substitution, error) {
	var out []domain.Substitution
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListSubstitutionsIncoming(ctx, tenantID, userID)
		return err
	})
	return out, err
}

func (s *Service) ListSubstitutionsOutgoing(ctx context.Context, tenantID, userID uuid.UUID) ([]domain.Substitution, error) {
	var out []domain.Substitution
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListSubstitutionsOutgoing(ctx, tenantID, userID)
		return err
	})
	return out, err
}

// ListSubstitutionsIncomingWithSchedule is ListSubstitutionsIncoming
// enriched with each row's class/subject/period, for the web
// substitutions page's session-card list.
func (s *Service) ListSubstitutionsIncomingWithSchedule(ctx context.Context, tenantID, userID uuid.UUID) ([]domain.SubstitutionWithSchedule, error) {
	var out []domain.SubstitutionWithSchedule
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListSubstitutionsIncomingWithSchedule(ctx, tenantID, userID)
		return err
	})
	return out, err
}

// ListSubstitutionsOutgoingWithSchedule is ListSubstitutionsOutgoing's
// enriched counterpart; see ListSubstitutionsIncomingWithSchedule.
func (s *Service) ListSubstitutionsOutgoingWithSchedule(ctx context.Context, tenantID, userID uuid.UUID) ([]domain.SubstitutionWithSchedule, error) {
	var out []domain.SubstitutionWithSchedule
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListSubstitutionsOutgoingWithSchedule(ctx, tenantID, userID)
		return err
	})
	return out, err
}

// ListedSubstitution is one row of the school-wide list: the request, the
// lesson it covers, and what a schedule manager's cancel would free.
type ListedSubstitution struct {
	domain.SubstitutionWithSchedule
	// ReleaseFrom is the earliest date the lesson's timetable could change
	// from once the request is cancelled, set only when that is earlier
	// than it can change now, or the lesson cannot change at all now: the
	// request is what holds the change back. Nil when cancelling it frees
	// nothing (another record holds the same date or a later one, the date
	// is the lesson's first, or the lesson ends first), and for a request a
	// manager cannot cancel (rejected, cancelled, or already past).
	ReleaseFrom *time.Time
}

// ListSubstitutionsAll is the manage_schedules-only "all" list scope; the
// transport layer is responsible for the permission check.
func (s *Service) ListSubstitutionsAll(ctx context.Context, tenantID uuid.UUID, status *domain.SubstitutionStatus) ([]ListedSubstitution, error) {
	var out []ListedSubstitution
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		subs, err := s.repo.ListSubstitutionsAll(ctx, tenantID, status)
		if err != nil {
			return err
		}
		frees, err := s.releaseDates(ctx, tenantID, subs)
		if err != nil {
			return err
		}
		out = make([]ListedSubstitution, len(subs))
		for i, sub := range subs {
			out[i] = ListedSubstitution{SubstitutionWithSchedule: sub}
			if from, ok := frees[sub.ID]; ok {
				out[i].ReleaseFrom = &from
			}
		}
		return nil
	})
	return out, err
}

// releaseDates is ListedSubstitution.ReleaseFrom for each request in subs
// whose cancel would move its lesson block's earliest change date earlier
// (or unlock a block whose every date left is bound now), keyed by request
// id. It compares the block's manager policy with and without the request's
// date, so it agrees with what the schedule editor offers before and after
// the cancel.
//
// A request binds a date on its own row only, so cancelling it changes
// anything only when it is the record holding that row's last history
// date: any other record on the same date or a later one still holds the
// row once it is gone. The list therefore reads the rows' history once,
// and looks up blocks and the history without the request only for the
// requests that hold their row, at most one per row; those all leave the
// history in one read, since none binds another's row. The reads do not
// grow with the number of requests listed, only with the lessons held.
func (s *Service) releaseDates(ctx context.Context, tenantID uuid.UUID, subs []domain.SubstitutionWithSchedule) (map[uuid.UUID]time.Time, error) {
	dates := s.changeDates(ctx, tenantID)
	var rowIDs []uuid.UUID
	for _, sub := range subs {
		if managerCancellable(sub.Substitution, dates.today) && !slices.Contains(rowIDs, sub.ScheduleID) {
			rowIDs = append(rowIDs, sub.ScheduleID)
		}
	}
	held, err := s.loadHistory(ctx, tenantID, rowIDs)
	if err != nil {
		return nil, err
	}

	type heldBlock struct {
		sched domain.Schedule
		rows  []domain.Schedule
	}
	blocks := map[uuid.UUID]heldBlock{}
	var holding []domain.Substitution
	var blockIDs, released []uuid.UUID
	for _, sub := range subs {
		if !managerCancellable(sub.Substitution, dates.today) || !held.heldBy(sub.ScheduleID, sub.ID) {
			continue
		}
		holding = append(holding, sub.Substitution)
		released = append(released, sub.ID)
		sched, err := s.repo.GetScheduleByID(ctx, tenantID, sub.ScheduleID)
		if err != nil {
			return nil, err
		}
		rows, err := s.lessonBlock(ctx, tenantID, sched)
		if err != nil {
			return nil, err
		}
		blocks[sub.ScheduleID] = heldBlock{sched: sched, rows: rows}
		for _, row := range rows {
			if !slices.Contains(rowIDs, row.ID) && !slices.Contains(blockIDs, row.ID) {
				blockIDs = append(blockIDs, row.ID)
			}
		}
	}
	if len(holding) == 0 {
		return nil, nil
	}
	others, err := s.loadHistory(ctx, tenantID, blockIDs)
	if err != nil {
		return nil, err
	}
	for id, h := range others {
		held[id] = h
	}
	heldRows := make([]uuid.UUID, len(holding))
	for i, sub := range holding {
		heldRows[i] = sub.ScheduleID
	}
	freed, err := s.loadHistoryReleasing(ctx, tenantID, heldRows, released)
	if err != nil {
		return nil, err
	}

	out := make(map[uuid.UUID]time.Time, len(holding))
	for _, sub := range holding {
		block := blocks[sub.ScheduleID]
		after := make(historyIndex, len(block.rows))
		for _, row := range block.rows {
			if entry, ok := held[row.ID]; ok {
				after[row.ID] = entry
			}
		}
		if entry, ok := freed[sub.ScheduleID]; ok {
			after[sub.ScheduleID] = entry
		}
		var policies [2]MutationPolicy
		for i, history := range []historyIndex{held, after} {
			window, err := dates.window(ctx, history, block.rows)
			if err != nil {
				return nil, err
			}
			policies[i] = managerPolicy(block.sched.EffectiveUntil, true, window, dates.today)
		}
		now, then := policies[0], policies[1]
		if !then.CanEdit || (now.CanEdit && !then.MinEffectiveFrom.Before(*now.MinEffectiveFrom)) {
			continue
		}
		out[sub.ID] = *then.MinEffectiveFrom
	}
	return out, nil
}

// managerCancellable reports whether a schedule manager may cancel sub:
// it is pending or accepted and dated today or later.
func managerCancellable(sub domain.Substitution, today time.Time) bool {
	active := sub.Status == domain.SubstitutionPending || sub.Status == domain.SubstitutionAccepted
	return active && !domain.CalendarDate(sub.Date).Before(today)
}

// ListEligibleSubstitutes backs the substitute picker (docs/analysis/
// backend-inventory.md section 1.13): active teachers this academic year,
// other than requesterUserID, matching search.
func (s *Service) ListEligibleSubstitutes(ctx context.Context, tenantID, academicYearID, requesterUserID uuid.UUID, search string, limit, offset int) ([]SubstituteCandidate, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var out []SubstituteCandidate
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListEligibleSubstituteTeachers(ctx, tenantID, academicYearID, requesterUserID, search, limit, offset)
		return err
	})
	return out, err
}
