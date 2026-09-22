package main

import (
	"database/sql"
	"fmt"
)

// SionPeriod is one live-schema periods row, global (10 rows, not scoped to
// a year). The target still gets one period_template per migrated year
// label (see migrate_schedule.go), matching the old per-year convention for
// consistency even though the source itself is no longer year-scoped.
type SionPeriod struct {
	ID        int64
	Name      string
	StartTime string // TIME, e.g. "07:00:00"
	EndTime   string
	Sequence  int
}

func (s *Source) FetchPeriods() ([]SionPeriod, error) {
	rows, err := s.db.Query(`select id, period_name, start_time, end_time, urutan from periods order by urutan`)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []SionPeriod
	for rows.Next() {
		var p SionPeriod
		if err := rows.Scan(&p.ID, &p.Name, &p.StartTime, &p.EndTime, &p.Sequence); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// SionScheduleVersion is one schedule_versions row for a migrated year. A
// year can have several (e.g. a mid-semester revision) -- the migrated
// timetable is the union of every one of them, newest effective_from
// winning wherever two versions claim the same class/weekday/period slot,
// rather than the single "prefer status = active" pick this ETL used to
// make (see buildScheduleUnion, migrate_schedule.go, and docs/13-etl-sion.md
// "Union jadwal": a revision already in daily use at this school was still
// marked 'scheduled', not 'active', so that rule silently dropped its
// attendance).
type SionScheduleVersion struct {
	ID            int64
	Name          string
	Status        string
	EffectiveFrom sql.NullTime
}

// FetchScheduleVersions reads every schedule_versions row for a year,
// oldest first (nulls first, then ascending effective_from, then id) --
// the order buildScheduleUnion's rank map relies on to decide which
// revision is "newest" for a given slot.
func (s *Source) FetchScheduleVersions(yearID int64) ([]SionScheduleVersion, error) {
	rows, err := s.db.Query(
		`select id, name, status, effective_from from schedule_versions
		 where year_id = ?
		 order by effective_from asc, id asc`,
		yearID,
	)
	if err != nil {
		return nil, fmt.Errorf("fetch schedule versions for year %d: %w", yearID, err)
	}
	defer func() { _ = rows.Close() }()
	var out []SionScheduleVersion
	for rows.Next() {
		var v SionScheduleVersion
		if err := rows.Scan(&v.ID, &v.Name, &v.Status, &v.EffectiveFrom); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("no schedule_versions row for year %d", yearID)
	}
	return out, nil
}

// SionSchedule is one live-schema schedules row: one class/day/single-period
// slot for one teacher_class. Unlike the old SION-rewrite schema there is no
// period range -- one row is exactly one period, so migrate_schedule.go sets
// start_period_id = end_period_id for the target row. day is Indonesian
// ('Senin'..'Jumat' in the live enum; MapDayOfWeek also accepts Sabtu/Minggu
// defensively). VersionID is the row's own teacher_classes.schedule_version_id
// (not schedules.schedule_version_id, see FetchSchedules), which
// buildScheduleUnion needs to rank competing rows for the same slot.
type SionSchedule struct {
	ID             int64
	Day            string
	TeacherClassID int64
	PeriodID       int64
	VersionID      int64
}

// FetchSchedules reads every schedule row for every schedule_version passed
// (a migrated year can have several -- see SionScheduleVersion), joined
// through teacher_classes -- the source of truth for which version a
// schedule belongs to, per docs/13-etl-sion.md, rather than filtering on
// schedules.schedule_version_id directly, which can be redundant or
// inconsistent with teacher_classes'. The raw, non-deduplicated result is
// what buildScheduleUnion (migrate_schedule.go) turns into the single
// target timetable.
func (s *Source) FetchSchedules(scheduleVersionIDs []int64) ([]SionSchedule, error) {
	placeholders, args := int64InClause(scheduleVersionIDs)
	rows, err := s.db.Query(
		// #nosec G202 -- placeholders is a "?,?,..." run built from len(scheduleVersionIDs), never from external input; the ids themselves are bound as args
		//nolint:gosec // placeholders is a "?,?,..." run built from len(scheduleVersionIDs), never from external input; the ids themselves are bound as args
		`select s.id, s.day, s.teacher_class_id, s.period_id, tc.schedule_version_id
		 from schedules s
		 join teacher_classes tc on tc.id = s.teacher_class_id
		 where tc.schedule_version_id in (`+placeholders+`)`,
		args...,
	)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []SionSchedule
	for rows.Next() {
		var sch SionSchedule
		if err := rows.Scan(&sch.ID, &sch.Day, &sch.TeacherClassID, &sch.PeriodID, &sch.VersionID); err != nil {
			return nil, err
		}
		out = append(out, sch)
	}
	return out, rows.Err()
}
