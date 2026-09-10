-- name: SupervisionCreateCycle :one
insert into supervision_cycles (tenant_id, academic_year_id, name, instrument)
values ($1, $2, $3, $4)
returning *;

-- name: SupervisionUpdateCycle :one
update supervision_cycles set name = $3, instrument = $4
where tenant_id = $1 and id = $2
returning *;

-- name: SupervisionGetCycle :one
select * from supervision_cycles where tenant_id = $1 and id = $2;

-- name: SupervisionListCyclesForYear :many
select * from supervision_cycles where tenant_id = $1 and academic_year_id = $2 order by name;
