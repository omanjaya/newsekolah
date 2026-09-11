-- name: CreateWarningLetter :one
insert into warning_letters (tenant_id, academic_year_id, student_user_id, level, level_label, threshold_points, total_points,
  letter_number, issued_by, snapshot, document_asset_id)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
returning *;

-- name: ListWarningLettersForStudent :many
select * from warning_letters
where tenant_id = $1 and academic_year_id = $2 and student_user_id = $3
order by level;

-- name: GetWarningLetter :one
select * from warning_letters where tenant_id = $1 and id = $2;

-- name: ListWarningLetters :many
select wl.* from warning_letters wl
where wl.tenant_id = $1 and wl.academic_year_id = $2
  and (sqlc.narg(class_id)::uuid is null or exists (
    select 1 from enrollments e where e.tenant_id = wl.tenant_id and e.academic_year_id = wl.academic_year_id
      and e.student_user_id = wl.student_user_id and e.class_id = sqlc.narg(class_id)::uuid and e.status = 'active'))
order by wl.issued_at desc
limit $3 offset $4;

-- name: ListSPCandidates :many
-- The counselor's issuing screen: every student whose active total has
-- reached at least the first SP level, searchable by name/NIS/class, with
-- the levels already issued so the UI can grey them out. The level filter
-- itself is a points range (min_points/max_points) the service derives
-- from the policy, since only Go holds the level ladder.
select vr.student_user_id, u.name as student_name, coalesce(sp.nis, '') as nis, coalesce(c.name, '') as class_name,
  coalesce(sum(vr.points_snapshot), 0)::int as total,
  coalesce(array_agg(distinct wl.level) filter (where wl.level is not null), '{}')::int[] as issued_levels
from violation_records vr
join users u on u.id = vr.student_user_id
left join student_profiles sp on sp.user_id = vr.student_user_id
left join enrollments e on e.tenant_id = vr.tenant_id and e.academic_year_id = vr.academic_year_id
  and e.student_user_id = vr.student_user_id and e.status = 'active'
left join classes c on c.id = e.class_id
left join warning_letters wl on wl.tenant_id = vr.tenant_id and wl.academic_year_id = vr.academic_year_id
  and wl.student_user_id = vr.student_user_id
where vr.tenant_id = $1 and vr.academic_year_id = $2 and vr.voided_at is null
  and (sqlc.narg(class_id)::uuid is null or e.class_id = sqlc.narg(class_id)::uuid)
  and (sqlc.narg(search)::text is null or u.name ilike '%' || sqlc.narg(search) || '%'
    or sp.nis ilike '%' || sqlc.narg(search) || '%' or c.name ilike '%' || sqlc.narg(search) || '%')
group by vr.student_user_id, u.name, sp.nis, c.name
having coalesce(sum(vr.points_snapshot), 0) >= sqlc.arg(min_points)::int
  and (sqlc.narg(max_points)::int is null or coalesce(sum(vr.points_snapshot), 0) <= sqlc.narg(max_points)::int)
order by total desc
limit $3 offset $4;
