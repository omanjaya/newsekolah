-- name: SupervisionCreateScheduledObservation :one
insert into supervision_scheduled_observations (tenant_id, cycle_id, schedule_id, lesson_date, teacher_user_id, observer_user_id)
values ($1, $2, $3, $4, $5, $6)
returning *;

-- name: SupervisionGetScheduledObservation :one
select * from supervision_scheduled_observations where tenant_id = $1 and id = $2;

-- name: SupervisionListScheduledForCycle :many
select * from supervision_scheduled_observations where tenant_id = $1 and cycle_id = $2 order by lesson_date desc;

-- name: SupervisionListScheduledForTeacher :many
select * from supervision_scheduled_observations
where tenant_id = $1 and cycle_id = $2 and teacher_user_id = $3
order by lesson_date desc;

-- name: SupervisionCreateObservation :one
insert into supervision_observations (tenant_id, scheduled_id, cycle_id, teacher_user_id, observer_user_id,
  scores, observer_notes, teacher_response, agreed_follow_up, observed_at)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
returning *;

-- name: SupervisionUpdateObservation :one
update supervision_observations set scores = $3, observer_notes = $4, teacher_response = $5, agreed_follow_up = $6
where tenant_id = $1 and id = $2
returning *;

-- name: SupervisionGetObservation :one
select * from supervision_observations where tenant_id = $1 and id = $2;

-- name: SupervisionGetObservationByScheduled :one
select * from supervision_observations where tenant_id = $1 and scheduled_id = $2;

-- name: SupervisionListObservationsForTeacherCycle :many
select * from supervision_observations
where tenant_id = $1 and cycle_id = $2 and teacher_user_id = $3
order by observed_at desc;

-- name: SupervisionListObservationsForCycle :many
select * from supervision_observations where tenant_id = $1 and cycle_id = $2 order by observed_at desc;
