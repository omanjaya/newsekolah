-- name: UpsertAttendanceDailySummary :exec
insert into attendance_daily_summary (
  tenant_id, academic_year_id, student_user_id, date, status_code, expected_sessions, submitted_sessions, computed_at
) values (
  $1, $2, $3, $4, $5, $6, $7, now()
)
on conflict (academic_year_id, student_user_id, date)
do update set status_code = excluded.status_code, expected_sessions = excluded.expected_sessions,
  submitted_sessions = excluded.submitted_sessions, computed_at = now();

-- name: GetAttendanceDailySummary :one
select * from attendance_daily_summary
where tenant_id = $1 and academic_year_id = $2 and student_user_id = $3 and date = $4;

-- name: ListAttendanceDailySummaryForStudentMonth :many
select * from attendance_daily_summary
where tenant_id = $1 and academic_year_id = $2 and student_user_id = $3
  and date >= $4 and date < $5
order by date;

-- name: ListAttendanceDailySummaryForClassDate :many
select ds.* from attendance_daily_summary ds
join enrollments en on en.student_user_id = ds.student_user_id and en.academic_year_id = ds.academic_year_id
where ds.tenant_id = $1 and ds.academic_year_id = $2 and en.class_id = $3 and ds.date = $4 and en.status = 'active';
