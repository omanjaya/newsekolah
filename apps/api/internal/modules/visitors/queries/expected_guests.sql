-- name: CreateExpectedGuest :one
insert into visitor_expected_guests (
  tenant_id, full_name, organization, host_user_id, purpose, expected_date, notes, created_by
) values ($1, $2, $3, $4, $5, $6, $7, $8)
returning *;

-- name: GetExpectedGuest :one
select * from visitor_expected_guests where tenant_id = $1 and id = $2;

-- name: ListExpectedGuests :many
-- The guard's lookup list: everyone expected on a given day, soonest first.
select * from visitor_expected_guests
where tenant_id = $1 and expected_date = $2
  and (sqlc.arg(include_resolved)::bool or status = 'pending')
order by created_at;

-- name: SetExpectedGuestStatus :one
update visitor_expected_guests set status = $3
where tenant_id = $1 and id = $2
returning *;

-- name: CancelExpectedGuest :exec
update visitor_expected_guests set status = 'cancelled'
where tenant_id = $1 and id = $2 and status = 'pending';
