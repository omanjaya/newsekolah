package service

import (
	"context"
	"errors"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
)

// academicYear reads the year whose dates bound a version's effective
// range; an unknown year is a missing schedule as far as callers can tell.
func (s *Service) academicYear(ctx context.Context, tenantID, academicYearID uuid.UUID) (AcademicYearRef, error) {
	year, err := s.repo.GetAcademicYearRef(ctx, tenantID, academicYearID)
	if errors.Is(err, pgx.ErrNoRows) {
		return AcademicYearRef{}, domain.ErrScheduleNotFound
	}
	return year, err
}

// lockScheduleBlock locks ids in a stable order before anything changes and
// checks they form one displayed block holding primary. FOR UPDATE also
// serializes concurrent attendance/substitution inserts, which take a key
// share lock on the row (the foreign key, and migration 0147's
// require_schedule_in_effect).
func (s *Service) lockScheduleBlock(ctx context.Context, tenantID, primaryID uuid.UUID, ids []uuid.UUID) (domain.Schedule, []domain.Schedule, error) {
	if len(ids) == 0 || len(ids) > 100 {
		return domain.Schedule{}, nil, domain.ErrInvalidScheduleBlock
	}
	ordered := append([]uuid.UUID(nil), ids...)
	sort.Slice(ordered, func(i, j int) bool { return ordered[i].String() < ordered[j].String() })
	rows := make([]domain.Schedule, 0, len(ordered))
	var primary domain.Schedule
	found := false
	for i, id := range ordered {
		if i > 0 && id == ordered[i-1] {
			return domain.Schedule{}, nil, domain.ErrInvalidScheduleBlock
		}
		row, err := s.repo.GetScheduleByID(ctx, tenantID, id)
		if err != nil {
			return domain.Schedule{}, nil, domain.ErrScheduleNotFound
		}
		if id == primaryID {
			primary, found = row, true
		}
		rows = append(rows, row)
	}
	if !found || len(domain.MergeContiguous(rows)) != 1 {
		return domain.Schedule{}, nil, domain.ErrInvalidScheduleBlock
	}
	return primary, rows, nil
}

// historyIndex is ListScheduleHistory keyed by schedule id; a schedule
// absent from it has no history.
type historyIndex map[uuid.UUID]domain.History

func (s *Service) loadHistory(ctx context.Context, tenantID uuid.UUID, ids []uuid.UUID) (historyIndex, error) {
	rows, err := s.repo.ListScheduleHistory(ctx, tenantID, ids)
	if err != nil {
		return nil, err
	}
	out := make(historyIndex, len(rows))
	for _, h := range rows {
		out[h.ScheduleID] = h
	}
	return out, nil
}

// hasAny reports whether any of ids has history.
func (h historyIndex) hasAny(ids []uuid.UUID) bool {
	for _, id := range ids {
		if _, ok := h[id]; ok {
			return true
		}
	}
	return false
}

// of is id's history, nil when it has none.
func (h historyIndex) of(id uuid.UUID) *domain.History {
	if entry, ok := h[id]; ok {
		return &entry
	}
	return nil
}

// changeDates works out when changes may take effect against one "now"
// (the school's date and wall clock, through the service clock so the time
// simulation moves it), looking each first period's start time up once.
type changeDates struct {
	svc      *Service
	tenantID uuid.UUID
	today    time.Time
	now      time.Time
	starts   map[uuid.UUID]time.Time
}

func (s *Service) changeDates(ctx context.Context, tenantID uuid.UUID) *changeDates {
	return &changeDates{svc: s, tenantID: tenantID, today: s.today(ctx), now: s.now(ctx), starts: map[uuid.UUID]time.Time{}}
}

// window is when a change to every one of rows may take effect:
// domain.ChangeWindowOf each row, joined (the latest Min, and the record
// holding it there when one does).
func (c *changeDates) window(ctx context.Context, history historyIndex, rows []domain.Schedule) (domain.ChangeWindow, error) {
	out := domain.ChangeWindowOf(c.today, domain.Schedule{}, nil)
	for _, row := range rows {
		begun, err := c.begun(ctx, row)
		if err != nil {
			return domain.ChangeWindow{}, err
		}
		floor := domain.ChangeFloor(c.today, begun)
		out = out.Join(domain.ChangeWindowOf(floor, row, history.of(row.ID)))
	}
	return out, nil
}

// begun reports whether row's lesson today has already begun
// (domain.LessonBegun); only a row on today's weekday needs its period.
func (c *changeDates) begun(ctx context.Context, row domain.Schedule) (bool, error) {
	if domain.IsoWeekday(c.today) != row.DayOfWeek || !row.EffectiveOn(c.today) {
		return false, nil
	}
	startsAt, ok := c.starts[row.StartPeriodID]
	if !ok {
		period, err := c.svc.repo.GetPeriodRef(ctx, c.tenantID, row.StartPeriodID)
		if err != nil {
			return false, err
		}
		startsAt = period.StartsAt
		c.starts[row.StartPeriodID] = startsAt
	}
	return domain.LessonBegun(row, c.today, c.now, startsAt), nil
}

// requireCurrent refuses an undated change or removal of a block any of
// whose rows has already ended: those rows describe past weeks only, and
// rewriting or deleting them would change what those weeks held (their
// lessons and every expected-lesson count) whether or not anything was
// recorded.
func requireCurrent(rows []domain.Schedule, today time.Time) error {
	for _, row := range rows {
		if row.EndedBefore(today) {
			return domain.ErrScheduleEnded
		}
	}
	return nil
}

// explainHistory turns ErrScheduleHasHistory from an undated change of
// rows into what a caller who may date a change (manage_schedules) can act
// on: ErrScheduleEnded when a row's last date has passed (no date helps),
// ErrScheduleChangeBeforeHistory when every date a row has left is bound
// by its history, or HistoryRequiresDateError naming the earliest date a
// dated change may use and the record that holds it there.
func (s *Service) explainHistory(ctx context.Context, tenantID uuid.UUID, err error, history historyIndex, rows []domain.Schedule, actor Actor) error {
	if err == nil || !actor.CanManage || !errors.Is(err, domain.ErrScheduleHasHistory) {
		return err
	}
	if ended := requireCurrent(rows, s.today(ctx)); ended != nil {
		return ended
	}
	window, dateErr := s.changeDates(ctx, tenantID).window(ctx, history, rows)
	if dateErr != nil {
		return dateErr
	}
	for _, row := range rows {
		if row.EffectiveUntil != nil && window.Min.After(domain.CalendarDate(*row.EffectiveUntil)) {
			return domain.ErrScheduleChangeBeforeHistory
		}
	}
	return &domain.HistoryRequiresDateError{Min: window.Min, HeldBy: window.HeldBy}
}
