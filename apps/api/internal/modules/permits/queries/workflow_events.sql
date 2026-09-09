-- name: CreateWorkflowEvent :one
insert into workflow_events (
  tenant_id, instance_id, stage_key, from_status, to_status, actor_user_id, verification, scan_token_id, note
)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
returning *;

-- name: ListWorkflowEventsByInstance :many
select * from workflow_events where tenant_id = $1 and instance_id = $2 order by occurred_at;

-- name: GetWorkflowEventByStage :one
-- Used to resolve a stage's approver for a later stage's distinct_from check.
select * from workflow_events
where tenant_id = $1 and instance_id = $2 and stage_key = $3
order by occurred_at desc
limit 1;
