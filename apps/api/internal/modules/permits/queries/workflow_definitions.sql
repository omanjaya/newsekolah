-- name: GetActiveWorkflowDefinition :one
select * from workflow_definitions where tenant_id = $1 and kind = $2 and is_active limit 1;

-- name: GetWorkflowDefinitionByID :one
select * from workflow_definitions where tenant_id = $1 and id = $2;

-- name: GetLatestWorkflowDefinitionVersion :one
select coalesce(max(version), 0)::int as latest_version
from workflow_definitions
where tenant_id = $1 and kind = $2;

-- name: DeactivateActiveWorkflowDefinitions :exec
update workflow_definitions set is_active = false where tenant_id = $1 and kind = $2 and is_active;

-- name: CreateWorkflowDefinition :one
insert into workflow_definitions (tenant_id, kind, version, is_active, stages, config, created_by)
values ($1, $2, $3, $4, $5, $6, $7)
returning *;

-- name: ListWorkflowDefinitions :many
select * from workflow_definitions where tenant_id = $1 order by kind, version desc;
