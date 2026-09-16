package main

import "fmt"

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

// SionScheduleVersion identifies the schedule_versions row selected for a
// migrated year, see resolveScheduleVersion.
type SionScheduleVersion struct {
	ID     int64
	Name   string
	Status string
}

// resolveScheduleVersion picks exactly one schedule_versions row for a
// year, since a year can have several (e.g. a mid-semester revision):
// prefer status = 'active'; if none is active, fall back to the one with
// the latest effective_from; if still tied, the highest id. The single
// `order by` below encodes all three tie-breaks in priority order --
// MySQL evaluates a boolean comparison as 1/0, so `(status = 'active')
// desc` sorts any active row first.
func (s *Source) resolveScheduleVersion(yearID int64) (SionScheduleVersion, error) {
	var v SionScheduleVersion
	err := s.db.QueryRow(
		`select id, name, status from schedule_versions
		 where year_id = ?
		 order by (status = 'active') desc, effective_from desc, id desc
		 limit 1`,
		yearID,
	).Scan(&v.ID, &v.Name, &v.Status)
	if err != nil {
		return SionScheduleVersion{}, fmt.Errorf("resolve schedule version for year %d: %w", yearID, err)
	}
	return v, nil
}

// SionSchedule is one live-schema schedules row: one class/day/single-period
// slot for one teacher_class. Unlike the old SION-rewrite schema there is no
// period range -- one row is exactly one period, so migrate_schedule.go sets
// start_period_id = end_period_id for the target row. day is Indonesian
// ('Senin'..'Jumat' in the live enum; MapDayOfWeek also accepts Sabtu/Minggu
// defensively).
type SionSchedule struct {
	ID             int64
	Day            string
	TeacherClassID int64
	PeriodID       int64
}

// FetchSchedules reads every schedule row for the chosen schedule_version,
// joined through teacher_classes -- the source of truth for which version a
// schedule belongs to, per docs/13-etl-sion.md, rather than filtering on
// schedules.schedule_version_id directly, which can be redundant or
// inconsistent with teacher_classes'.
func (s *Source) FetchSchedules(scheduleVersionID int64) ([]SionSchedule, error) {
	rows, err := s.db.Query(
		`select s.id, s.day, s.teacher_class_id, s.period_id
		 from schedules s
		 join teacher_classes tc on tc.id = s.teacher_class_id
		 where tc.schedule_version_id = ?`,
		scheduleVersionID,
	)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []SionSchedule
	for rows.Next() {
		var sch SionSchedule
		if err := rows.Scan(&sch.ID, &sch.Day, &sch.TeacherClassID, &sch.PeriodID); err != nil {
			return nil, err
		}
		out = append(out, sch)
	}
	return out, rows.Err()
}
