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

// earliestChange is the first date a change to all of ids may take effect
// from: today, or the day after the latest date any of them has history
// for.
func (h historyIndex) earliestChange(today time.Time, ids []uuid.UUID) time.Time {
	earliest := domain.CalendarDate(today)
	for _, id := range ids {
		if entry, ok := h[id]; ok {
			earliest = domain.LaterDate(earliest, domain.EarliestChange(today, entry.Until))
		}
	}
	return earliest
}

// explain turns ErrScheduleHasHistory from an undated change of rows into
// what a caller who may date a change (manage_schedules) can act on:
// ErrScheduleEnded when a row's last date has passed (no date helps), or
// HistoryRequiresDateError naming the earliest date a dated change may use.
func (h historyIndex) explain(err error, today time.Time, rows []domain.Schedule, actor Actor) error {
	if err == nil || !actor.CanManage || !errors.Is(err, domain.ErrScheduleHasHistory) {
		return err
	}
	ids := make([]uuid.UUID, len(rows))
	for i, row := range rows {
		if row.EndedBefore(today) {
			return domain.ErrScheduleEnded
		}
		ids[i] = row.ID
	}
	return &domain.HistoryRequiresDateError{Min: h.earliestChange(today, ids)}
}
