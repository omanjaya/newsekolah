-- Reverses 0145_duty_view_mentoring.up.sql: the counselor and leadership
-- duties lose view_mentoring again.
delete from duty_permissions
using duty_types
where duty_permissions.duty_type_id = duty_types.id
  and duty_types.slug in ('counselor', 'leadership')
  and duty_permissions.permission_code = 'view_mentoring';
