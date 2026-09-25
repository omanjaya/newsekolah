package main

import (
	"database/sql"
	"time"
)

// SionExitPermit is one live-schema student_permits row: a student's
// request to leave the school grounds (and, unless return_required is
// false, return) during the day. Only rows this ETL treats as final --
// status 'completed' or 'expired', see migrate_permits.go -- are fetched;
// 'approved' (never exited yet) and 'out' (exited, not yet returned) are
// still mid-flow and deliberately left out, per the rule documented in
// docs/13-etl-sion.md. permit_type 'late' rows are excluded here too: they
// describe a late-arrival check-in through the same generic table, and
// late_arrival is out of scope for this pass.
type SionExitPermit struct {
	ID                int64
	StudentID         int64
	Reason            string
	IsQuick           bool
	IsInternal        bool
	ReturnRequired    bool
	StartPeriodID     sql.NullInt64
	EndPeriodID       sql.NullInt64
	PicketApprovedAt  sql.NullTime
	TeacherApprovedAt sql.NullTime
	BKApprovedAt      sql.NullTime
	WakaApprovedAt    sql.NullTime
	SecurityOutID     sql.NullInt64
	SecurityOutAt     sql.NullTime
	SecurityInAt      sql.NullTime
	Status            string
	CreatedAt         time.Time
	UpdatedAt         time.Time
	ClassID           sql.NullInt64
	ClassName         sql.NullString
}

// FetchExitPermits reads final-state student_permits rows created within
// the migrated semester's date range (student_permits carries no year_id of
// its own), joined to the student's class for that year through
// group_members/groups -- the same one-class-per-student-per-year
// assumption migrateEnrollments relies on.
func (s *Source) FetchExitPermits(yearID int64, semesterStart, semesterEnd time.Time) ([]SionExitPermit, error) {
	rows, err := s.db.Query(
		`select sp.id, sp.user_id, sp.reason, sp.is_quick, sp.is_internal, sp.return_required,
		        sp.start_period_id, sp.end_period_id,
		        sp.picket_approved_at, sp.teacher_approved_at, sp.bk_approved_at, sp.waka_approved_at,
		        sp.security_check_out_id, sp.security_check_out_at, sp.security_check_in_at,
		        sp.status, sp.created_at, sp.updated_at, cls.class_id, cls.class_name
		 from student_permits sp
		 left join (
		   select gm.user_id, g.id as class_id, g.name as class_name
		   from group_members gm join groups g on g.id = gm.group_id
		   where g.year_id = ?
		 ) cls on cls.user_id = sp.user_id
		 where sp.status in ('completed', 'expired') and sp.permit_type <> 'late'
		   and sp.created_at >= ? and sp.created_at < ?
		 order by sp.id`,
		yearID, semesterStart, semesterEnd,
	)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []SionExitPermit
	for rows.Next() {
		var p SionExitPermit
		if err := rows.Scan(
			&p.ID, &p.StudentID, &p.Reason, &p.IsQuick, &p.IsInternal, &p.ReturnRequired,
			&p.StartPeriodID, &p.EndPeriodID,
			&p.PicketApprovedAt, &p.TeacherApprovedAt, &p.BKApprovedAt, &p.WakaApprovedAt,
			&p.SecurityOutID, &p.SecurityOutAt, &p.SecurityInAt,
			&p.Status, &p.CreatedAt, &p.UpdatedAt, &p.ClassID, &p.ClassName,
		); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// CountExitPermitsNotFinal reports how many student_permits rows in the
// migrated semester's date range are not in a final state (status
// 'approved' or 'out') or are permit_type 'late', for the report's gap
// line -- see FetchExitPermits' doc comment.
func (s *Source) CountExitPermitsNotFinal(_ int64, semesterStart, semesterEnd time.Time) (notFinal, lateType int, err error) {
	// coalesce(..., 0): MySQL's sum() over zero matching rows (e.g. a
	// semester with no student_permits rows at all, or none matching the
	// inner boolean condition) returns NULL, not 0 -- Scan into a plain
	// int then fails with "converting NULL to int is unsupported". A
	// semester genuinely having zero not-final or zero 'late' permits is
	// an entirely ordinary case (confirmed against a real SION database
	// during the ETL dress rehearsal, docs/analysis/etl-rehearsal-2026-09-25.md),
	// not something that should abort the whole run.
	err = s.db.QueryRow(
		`select
		   coalesce(sum(status not in ('completed', 'expired')), 0),
		   coalesce(sum(status in ('completed', 'expired') and permit_type = 'late'), 0)
		 from student_permits
		 where created_at >= ? and created_at < ?`,
		semesterStart, semesterEnd,
	).Scan(&notFinal, &lateType)
	return notFinal, lateType, err
}

// SionLeaveRequest is one live-schema permits row: a student's multi-day
// planned-leave request, reviewed by the homeroom teacher
// (class_admin_approve) then the counselor (bk_approve) in that order. Only
// rows that reached a final state are fetched: class_admin_approve = 0
// (rejected at the first stage) or bk_approve = 1 and class_admin_approve =
// 1 (both stages passed); a request still awaiting either stage is mid-flow
// and left out, per docs/13-etl-sion.md.
type SionLeaveRequest struct {
	ID          int64
	StudentID   int64
	PermitName  string
	OtherPermit sql.NullString
	StartDate   time.Time
	EndDate     time.Time
	BKApprove   sql.NullBool
	ClassAdmin  sql.NullBool
	CreatedAt   time.Time
	UpdatedAt   time.Time
	ClassID     sql.NullInt64
	ClassName   sql.NullString
}

// FetchLeaveRequests reads final-state permits rows created within the
// migrated semester's date range, joined to the student's class the same
// way FetchExitPermits is.
func (s *Source) FetchLeaveRequests(yearID int64, semesterStart, semesterEnd time.Time) ([]SionLeaveRequest, error) {
	rows, err := s.db.Query(
		`select p.id, p.user_id, p.permit_name, p.other_permits, p.start_date, p.end_date,
		        p.bk_approve, p.class_admin_approve, p.created_at, p.updated_at, cls.class_id, cls.class_name
		 from permits p
		 left join (
		   select gm.user_id, g.id as class_id, g.name as class_name
		   from group_members gm join groups g on g.id = gm.group_id
		   where g.year_id = ?
		 ) cls on cls.user_id = p.user_id
		 where p.created_at >= ? and p.created_at < ?
		   and (
		     (p.class_admin_approve = 0)
		     or (p.bk_approve = 1 and p.class_admin_approve = 1)
		   )
		 order by p.id`,
		yearID, semesterStart, semesterEnd,
	)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []SionLeaveRequest
	for rows.Next() {
		var p SionLeaveRequest
		if err := rows.Scan(
			&p.ID, &p.StudentID, &p.PermitName, &p.OtherPermit, &p.StartDate, &p.EndDate,
			&p.BKApprove, &p.ClassAdmin, &p.CreatedAt, &p.UpdatedAt, &p.ClassID, &p.ClassName,
		); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// CountLeaveRequestsNotFinal reports how many permits rows in the migrated
// semester's date range are still mid-flow (awaiting the homeroom teacher's
// or counselor's decision), for the report's gap line.
func (s *Source) CountLeaveRequestsNotFinal(semesterStart, semesterEnd time.Time) (int, error) {
	var n int
	err := s.db.QueryRow(
		`select count(*) from permits
		 where created_at >= ? and created_at < ?
		   and not (class_admin_approve = 0)
		   and not (bk_approve = 1 and class_admin_approve = 1)`,
		semesterStart, semesterEnd,
	).Scan(&n)
	return n, err
}
