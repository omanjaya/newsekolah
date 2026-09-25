-- Reverses 0119_remove_parent_role.up.sql structurally: the role, its
-- permissions, the profile kind, and the link table come back empty (no
-- migration can resurrect deleted rows or know which historical workflow
-- instances would have stayed on a guardian stage), matching this
-- project's other role-removal migrations (see 0117_principal_role.down.sql).

alter table leave_requests add column if not exists parent_approved_at timestamptz;

alter table user_profiles drop constraint user_profiles_kind_check;
alter table user_profiles add constraint user_profiles_kind_check
  check (kind in ('student', 'teacher', 'staff', 'parent'));

create table if not exists parent_students (
  parent_user_id uuid not null references users (id) on delete cascade,
  student_user_id uuid not null references users (id) on delete cascade,
  tenant_id uuid not null references tenants (id) on delete cascade,
  relation text not null check (relation in ('father', 'mother', 'guardian')),
  can_approve_leave boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (parent_user_id, student_user_id)
);

create index if not exists ix_parent_students_tenant_id on parent_students (tenant_id);
create index if not exists ix_parent_students_student_user_id on parent_students (student_user_id);

alter table parent_students enable row level security;
alter table parent_students force row level security;

drop policy if exists tenant_isolation on parent_students;
create policy tenant_isolation on parent_students
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

insert into permissions (code, group_name, description) values
  ('view_child_attendance', 'parent', 'View a linked child''s attendance'),
  ('view_child_grades', 'parent', 'View a linked child''s grades'),
  ('approve_child_leave_requests', 'parent', 'Approve or reject a linked child''s leave request at a guardian workflow stage'),
  ('view_child_billing', 'billing', 'See a linked child''s bills and payment history')
on conflict (code) do nothing;

-- The role itself is recreated empty (no permissions, no members): a real
-- rollback needs cmd/migrate's PostUp / EnsureTenantDefaults to re-run to
-- grant authz.RoleDefaults's permission set and reach every tenant again.
insert into roles (tenant_id, slug, name, is_system)
select id, 'parent', 'Orang Tua', true
from tenants
on conflict (tenant_id, slug) do nothing;
