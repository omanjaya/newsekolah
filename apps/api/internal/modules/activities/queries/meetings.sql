-- name: CreateMeeting :one
insert into extracurricular_meetings (tenant_id, extracurricular_id, meeting_date, notes)
values ($1, $2, $3, $4)
returning *;

-- name: GetMeeting :one
select * from extracurricular_meetings where tenant_id = $1 and id = $2;

-- name: ListMeetingsForClub :many
select * from extracurricular_meetings
where tenant_id = $1 and extracurricular_id = $2
order by meeting_date desc;

-- name: UpsertAttendance :one
insert into extracurricular_attendance (tenant_id, meeting_id, student_user_id, status_code, notes, recorded_by)
values ($1, $2, $3, $4, $5, $6)
on conflict (meeting_id, student_user_id) do update
  set status_code = excluded.status_code, notes = excluded.notes, recorded_by = excluded.recorded_by, updated_at = now()
returning *;

-- name: ListAttendanceForMeeting :many
select * from extracurricular_attendance where tenant_id = $1 and meeting_id = $2 order by created_at;

-- name: ListAttendanceForClub :many
select a.* from extracurricular_attendance a
join extracurricular_meetings m on m.id = a.meeting_id
where a.tenant_id = $1 and m.extracurricular_id = $2
order by m.meeting_date, a.created_at;

-- name: ListActiveMemberStudentIDs :many
select student_user_id from extracurricular_memberships
where tenant_id = $1 and extracurricular_id = $2 and status = 'active'
order by joined_on;
