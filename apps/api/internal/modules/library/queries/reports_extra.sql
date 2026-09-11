-- Report figures that need library_members/library_visits plus the
-- academic module's enrollments/classes, now that both exist in this
-- worktree (migrations 0090-0092): the accreditation summary's
-- students/members/visits counts, the visits and members reports, top
-- borrowers with class for the popular report, and the monthly printable
-- report's indicators.

-- name: CountActiveStudentsTotal :one
select count(*)::int
from users u
join user_profiles up on up.user_id = u.id and up.kind = 'student'
where u.tenant_id = $1 and u.deleted_at is null and u.status = 'active';

-- name: CountMembersTotal :one
select count(*)::int from library_members where tenant_id = $1;

-- name: CountActiveMembersTotal :one
select count(*)::int from library_members where tenant_id = $1 and status = 'active';

-- name: CountVisitsBetween :one
select count(*)::int from library_visits where tenant_id = $1 and visited_at >= $2 and visited_at < $3;

-- name: CountCopiesAddedInPeriod :one
select count(*)::int from library_copies where tenant_id = $1 and created_at >= $2 and created_at < $3;

-- name: CountLateReturnsBetween :one
select count(*)::int from library_loans
where tenant_id = $1 and returned_at >= $2 and returned_at < $3 and returned_at::date > due_on;

-- name: SumFinesRecordedBetween :one
select coalesce(sum(fine_amount), 0)::int from library_loans
where tenant_id = $1 and returned_at >= $2 and returned_at < $3 and fine_amount > 0;

-- name: VisitsPerDay :many
select date(visited_at) as day, count(*)::int as visit_count
from library_visits
where tenant_id = $1 and visited_at >= $2 and visited_at < $3
group by day
order by day;

-- name: VisitsPerClass :many
-- "Lainnya" for a visit whose member has no active enrollment (or is not
-- a member at all -- a walk-in guest) is applied by the service layer,
-- which is where every other report's display labels are resolved.
select coalesce(c.name, '') as class_name, count(*)::int as visit_count
from library_visits v
left join lateral (
  select e.class_id from enrollments e
  where e.tenant_id = v.tenant_id and e.student_user_id = v.member_user_id and e.status = 'active'
  order by e.joined_on desc limit 1
) e on true
left join classes c on c.id = e.class_id
where v.tenant_id = $1 and v.visited_at >= $2 and v.visited_at < $3
group by c.name
order by visit_count desc;

-- name: MembersByType :many
select mt.id, mt.name, count(m.user_id)::int as member_count
from library_member_types mt
left join library_members m on m.tenant_id = mt.tenant_id and m.member_type_id = mt.id
where mt.tenant_id = $1 and mt.deleted_at is null
group by mt.id, mt.name
order by mt.name;

-- name: MembersByClass :many
select coalesce(c.name, '') as class_name, count(*)::int as member_count
from library_members m
left join lateral (
  select e.class_id from enrollments e
  where e.tenant_id = m.tenant_id and e.student_user_id = m.user_id and e.status = 'active'
  order by e.joined_on desc limit 1
) e on true
left join classes c on c.id = e.class_id
where m.tenant_id = $1
group by c.name
order by member_count desc;

-- name: TopBorrowersInPeriod :many
select l.member_user_id, count(*)::int as loan_count, coalesce(c.name, '') as class_name
from library_loans l
left join lateral (
  select e.class_id from enrollments e
  where e.tenant_id = l.tenant_id and e.student_user_id = l.member_user_id and e.status = 'active'
  order by e.joined_on desc limit 1
) e on true
left join classes c on c.id = e.class_id
where l.tenant_id = $1 and l.borrowed_at >= $2 and l.borrowed_at < $3
group by l.member_user_id, c.name
order by loan_count desc
limit $4;
