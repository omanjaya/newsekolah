-- name: BillingActiveEnrollments :many
-- cross-module read: enrollments/classes (academic), for the student list
-- generation charges and the arrears report groups by class.
select student_user_id, class_id from enrollments
where tenant_id = $1 and academic_year_id = $2 and status = 'active';

-- name: BillingStudentDisplay :one
-- cross-module read: users (identity) and enrollments/classes (academic),
-- for the name and class printed on a receipt.
select u.name as student_name, coalesce(c.name, '') as class_name, coalesce(sp.guardian_name, '') as guardian_name
from users u
left join enrollments e on e.student_user_id = u.id and e.academic_year_id = $3 and e.status = 'active'
left join classes c on c.id = e.class_id
left join student_profiles sp on sp.user_id = u.id
where u.tenant_id = $1 and u.id = $2;
