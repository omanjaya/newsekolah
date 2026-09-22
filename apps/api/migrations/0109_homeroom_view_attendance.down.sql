-- Removes the view_attendance grant from every tenant's homeroom duty.
delete from duty_permissions
using duty_types
where duty_permissions.duty_type_id = duty_types.id
  and duty_types.slug = 'homeroom'
  and duty_permissions.permission_code = 'view_attendance';
