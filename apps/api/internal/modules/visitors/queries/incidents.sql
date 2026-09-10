-- name: CreateIncident :one
insert into visitor_incidents (
  tenant_id, occurred_at, severity, description, persons_involved, action_taken, reported_by
) values ($1, $2, $3, $4, $5, $6, $7)
returning *;

-- name: GetIncident :one
select * from visitor_incidents where tenant_id = $1 and id = $2;

-- name: UpdateIncident :one
update visitor_incidents
set severity = $3, description = $4, persons_involved = $5, action_taken = $6
where tenant_id = $1 and id = $2
returning *;

-- name: CloseIncident :one
update visitor_incidents set is_closed = true, closed_at = $3, closed_by = $4
where tenant_id = $1 and id = $2 and is_closed = false
returning *;

-- name: ListIncidents :many
select * from visitor_incidents
where tenant_id = $1
  and occurred_at >= $2 and occurred_at < $3
  and (sqlc.arg(include_closed)::bool or is_closed = false)
order by occurred_at desc
limit $4 offset $5;

-- name: CountIncidentsBySeverityInRange :many
select severity, count(*)::int as total from visitor_incidents
where tenant_id = $1 and occurred_at >= $2 and occurred_at < $3
group by severity;
