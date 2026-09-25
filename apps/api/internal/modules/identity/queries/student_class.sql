-- name: GetActiveClassForStudent :one
select c.id as class_id, c.name as class_name
from enrollments e
join classes c on c.id = e.class_id and c.deleted_at is null
where e.tenant_id = $1 and e.student_user_id = $2 and e.academic_year_id = $3 and e.status = 'active'
limit 1;
