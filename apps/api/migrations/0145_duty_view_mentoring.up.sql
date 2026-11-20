-- The counselor (Guru BK) and leadership (Wakil Kepala Sekolah) duties now
-- carry view_mentoring (internal/platform/authz/duty_defaults.go).
-- domain.MeetingNote.VisibleTo lets both read a guru wali's meeting notes,
-- and the notes endpoint returned them, but the group page and its
-- members answered 403 MENTOR_GROUP_FORBIDDEN and no group list was open
-- to them, so the app offered no way to reach those notes. view_mentoring
-- is the read-only school-wide reader (group rosters, the student
-- snapshot), never authoring: notes and term summaries stay written by
-- the group's mentor or a group manager.
--
-- Duty types are not synced for existing tenants by cmd/migrate's PostUp,
-- so the grant is made here, as 0134_view_counseling_permission did.
insert into duty_permissions (duty_type_id, permission_code, tenant_id)
select duty_types.id, 'view_mentoring', duty_types.tenant_id
from duty_types
where duty_types.slug in ('counselor', 'leadership') and duty_types.deleted_at is null
on conflict do nothing;
