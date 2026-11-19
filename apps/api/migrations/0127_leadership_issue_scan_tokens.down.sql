-- Removes the issue_scan_tokens grant from every tenant's leadership duty.
delete from duty_permissions
using duty_types
where duty_permissions.duty_type_id = duty_types.id
  and duty_types.slug = 'leadership'
  and duty_permissions.permission_code = 'issue_scan_tokens';
