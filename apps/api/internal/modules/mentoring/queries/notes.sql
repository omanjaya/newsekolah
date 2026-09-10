-- name: MentoringCreateMeetingNote :one
insert into mentor_meeting_notes (tenant_id, academic_year_id, group_id, mentor_user_id, met_at, kind,
  attendee_user_ids, topic, content_encrypted, content_key_id, agreed_actions_encrypted)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
returning *;

-- name: MentoringUpdateMeetingNote :one
update mentor_meeting_notes set met_at = $3, kind = $4, attendee_user_ids = $5, topic = $6,
  content_encrypted = $7, content_key_id = $8, agreed_actions_encrypted = $9
where tenant_id = $1 and id = $2
returning *;

-- name: MentoringGetMeetingNote :one
select * from mentor_meeting_notes where tenant_id = $1 and id = $2;

-- name: MentoringListMeetingNotesForGroup :many
select * from mentor_meeting_notes where tenant_id = $1 and group_id = $2 order by met_at desc;

-- name: MentoringDeleteMeetingNote :exec
delete from mentor_meeting_notes where tenant_id = $1 and id = $2;
