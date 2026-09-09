create table users (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  username text not null check (length(username) between 3 and 80),
  email text,
  phone text,
  password_hash text not null,
  name text not null check (length(name) <= 150),
  status text not null default 'invited' check (status in ('active', 'inactive', 'invited')),
  must_change_password boolean not null default false,
  last_login_at timestamptz,
  locale text not null default 'id' check (locale in ('id', 'en')),
  avatar_asset_id uuid references assets (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, username),
  unique (tenant_id, email),
  unique (tenant_id, phone)
);

create index ix_users_tenant_id on users (tenant_id);
create index ix_users_avatar_asset_id on users (avatar_asset_id);

alter table users enable row level security;
alter table users force row level security;

create policy tenant_isolation on users
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create trigger trg_users_set_updated_at
  before update on users
  for each row execute function set_updated_at();

create table user_profiles (
  user_id uuid primary key references users (id) on delete cascade,
  tenant_id uuid not null references tenants (id) on delete cascade,
  kind text not null check (kind in ('student', 'teacher', 'staff', 'parent')),
  nik text,
  gender text check (gender in ('male', 'female')),
  birth_place text,
  birth_date date,
  religion text,
  address text,
  district text,
  city text,
  blood_type text,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ix_user_profiles_tenant_id on user_profiles (tenant_id);

alter table user_profiles enable row level security;
alter table user_profiles force row level security;

create policy tenant_isolation on user_profiles
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create trigger trg_user_profiles_set_updated_at
  before update on user_profiles
  for each row execute function set_updated_at();

create table student_profiles (
  user_id uuid primary key references users (id) on delete cascade,
  tenant_id uuid not null references tenants (id) on delete cascade,
  nis text,
  nisn text,
  entry_year smallint,
  previous_school text,
  father_name text,
  mother_name text,
  guardian_name text,
  guardian_phone text,
  parent_occupation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, nis),
  unique (tenant_id, nisn)
);

create index ix_student_profiles_tenant_id on student_profiles (tenant_id);

alter table student_profiles enable row level security;
alter table student_profiles force row level security;

create policy tenant_isolation on student_profiles
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create trigger trg_student_profiles_set_updated_at
  before update on student_profiles
  for each row execute function set_updated_at();

create table teacher_profiles (
  user_id uuid primary key references users (id) on delete cascade,
  tenant_id uuid not null references tenants (id) on delete cascade,
  nip text,
  nuptk text,
  employment_status text,
  last_education text,
  joined_year smallint,
  specialization text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ix_teacher_profiles_tenant_id on teacher_profiles (tenant_id);

alter table teacher_profiles enable row level security;
alter table teacher_profiles force row level security;

create policy tenant_isolation on teacher_profiles
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create trigger trg_teacher_profiles_set_updated_at
  before update on teacher_profiles
  for each row execute function set_updated_at();

create table staff_profiles (
  user_id uuid primary key references users (id) on delete cascade,
  tenant_id uuid not null references tenants (id) on delete cascade,
  employee_number text,
  position text,
  employment_status text,
  last_education text,
  joined_year smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ix_staff_profiles_tenant_id on staff_profiles (tenant_id);

alter table staff_profiles enable row level security;
alter table staff_profiles force row level security;

create policy tenant_isolation on staff_profiles
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create trigger trg_staff_profiles_set_updated_at
  before update on staff_profiles
  for each row execute function set_updated_at();

create table parent_students (
  parent_user_id uuid not null references users (id) on delete cascade,
  student_user_id uuid not null references users (id) on delete cascade,
  tenant_id uuid not null references tenants (id) on delete cascade,
  relation text not null check (relation in ('father', 'mother', 'guardian')),
  can_approve_leave boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (parent_user_id, student_user_id)
);

create index ix_parent_students_tenant_id on parent_students (tenant_id);
create index ix_parent_students_student_user_id on parent_students (student_user_id);

alter table parent_students enable row level security;
alter table parent_students force row level security;

create policy tenant_isolation on parent_students
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table roles (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9_]{2,50}$'),
  name text not null check (length(name) <= 150),
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);

create index ix_roles_tenant_id on roles (tenant_id);

alter table roles enable row level security;
alter table roles force row level security;

create policy tenant_isolation on roles
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create trigger trg_roles_set_updated_at
  before update on roles
  for each row execute function set_updated_at();

-- Static, platform-wide permission catalog. Not tenant-scoped: seeded and
-- kept in sync with internal/platform/authz/permissions.go by cmd/migrate.
create table permissions (
  code text primary key,
  group_name text not null,
  description text not null
);

create table role_permissions (
  role_id uuid not null references roles (id) on delete cascade,
  permission_code text not null references permissions (code) on delete cascade,
  tenant_id uuid not null references tenants (id) on delete cascade,
  primary key (role_id, permission_code)
);

create index ix_role_permissions_tenant_id on role_permissions (tenant_id);
create index ix_role_permissions_permission_code on role_permissions (permission_code);

alter table role_permissions enable row level security;
alter table role_permissions force row level security;

create policy tenant_isolation on role_permissions
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table user_roles (
  user_id uuid not null references users (id) on delete cascade,
  role_id uuid not null references roles (id) on delete cascade,
  tenant_id uuid not null references tenants (id) on delete cascade,
  is_primary boolean not null default false,
  academic_year_id uuid,
  primary key (user_id, role_id)
);

create index ix_user_roles_tenant_id on user_roles (tenant_id);
create index ix_user_roles_role_id on user_roles (role_id);
create index ix_user_roles_academic_year_id on user_roles (academic_year_id);

alter table user_roles enable row level security;
alter table user_roles force row level security;

create policy tenant_isolation on user_roles
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table duty_types (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9_]{2,50}$'),
  name text not null check (length(name) <= 150),
  scope_kind text not null check (scope_kind in ('school', 'class', 'student')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, slug)
);

create index ix_duty_types_tenant_id on duty_types (tenant_id);

alter table duty_types enable row level security;
alter table duty_types force row level security;

create policy tenant_isolation on duty_types
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create trigger trg_duty_types_set_updated_at
  before update on duty_types
  for each row execute function set_updated_at();

create table duty_permissions (
  duty_type_id uuid not null references duty_types (id) on delete cascade,
  permission_code text not null references permissions (code) on delete cascade,
  tenant_id uuid not null references tenants (id) on delete cascade,
  primary key (duty_type_id, permission_code)
);

create index ix_duty_permissions_tenant_id on duty_permissions (tenant_id);
create index ix_duty_permissions_permission_code on duty_permissions (permission_code);

alter table duty_permissions enable row level security;
alter table duty_permissions force row level security;

create policy tenant_isolation on duty_permissions
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table duty_assignments (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  academic_year_id uuid not null,
  duty_type_id uuid not null references duty_types (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  scope_class_id uuid,
  scope_student_id uuid references users (id) on delete cascade,
  is_active boolean not null default true,
  starts_on date not null,
  ends_on date,
  created_at timestamptz not null default now(),
  unique (academic_year_id, duty_type_id, user_id, scope_class_id, scope_student_id)
);

create index ix_duty_assignments_tenant_id on duty_assignments (tenant_id, academic_year_id);
create index ix_duty_assignments_user_id on duty_assignments (user_id);
create index ix_duty_assignments_duty_type_id on duty_assignments (duty_type_id);
create index ix_duty_assignments_scope_class_id on duty_assignments (scope_class_id);
create index ix_duty_assignments_scope_student_id on duty_assignments (scope_student_id);

alter table duty_assignments enable row level security;
alter table duty_assignments force row level security;

create policy tenant_isolation on duty_assignments
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table sessions (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  kind text not null default 'login' check (kind in ('login', 'impersonation')),
  actor_user_id uuid references users (id) on delete set null,
  refresh_token_hash bytea not null unique,
  family_id uuid not null,
  client text not null check (client in ('web', 'ios', 'android')),
  device_id text,
  device_name text,
  user_agent text,
  ip inet,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_reason text
);

create index ix_sessions_tenant_id on sessions (tenant_id);
create index ix_sessions_user_id on sessions (user_id);
create index ix_sessions_family_id on sessions (family_id);
create index ix_sessions_actor_user_id on sessions (actor_user_id);

alter table sessions enable row level security;
alter table sessions force row level security;

create policy tenant_isolation on sessions
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table mfa_totp (
  user_id uuid primary key references users (id) on delete cascade,
  tenant_id uuid not null references tenants (id) on delete cascade,
  secret_encrypted bytea not null,
  confirmed_at timestamptz,
  recovery_codes_hash text[] not null default '{}'
);

create index ix_mfa_totp_tenant_id on mfa_totp (tenant_id);

alter table mfa_totp enable row level security;
alter table mfa_totp force row level security;

create policy tenant_isolation on mfa_totp
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table webauthn_credentials (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  credential_id bytea not null unique,
  public_key bytea not null,
  sign_count bigint not null default 0,
  transports text[],
  name text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index ix_webauthn_credentials_tenant_id on webauthn_credentials (tenant_id);
create index ix_webauthn_credentials_user_id on webauthn_credentials (user_id);

alter table webauthn_credentials enable row level security;
alter table webauthn_credentials force row level security;

create policy tenant_isolation on webauthn_credentials
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table password_resets (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  token_hash bytea not null unique,
  channel text not null check (channel in ('email', 'whatsapp', 'admin')),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index ix_password_resets_tenant_id on password_resets (tenant_id);
create index ix_password_resets_user_id on password_resets (user_id);

alter table password_resets enable row level security;
alter table password_resets force row level security;

create policy tenant_isolation on password_resets
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Partitioned monthly (retention 90 days per docs/06 section 3); a default
-- partition absorbs any month without an explicit partition.
create table login_attempts (
  id uuid not null default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  username text not null,
  ip inet,
  success boolean not null,
  occurred_at timestamptz not null default now(),
  primary key (id, occurred_at)
) partition by range (occurred_at);

create table login_attempts_default partition of login_attempts default;

create index ix_login_attempts_tenant_username on login_attempts (tenant_id, username, occurred_at desc);
create index ix_login_attempts_ip on login_attempts (ip, occurred_at desc);

alter table login_attempts enable row level security;
alter table login_attempts force row level security;

create policy tenant_isolation on login_attempts
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table impersonation_actions (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  session_id uuid not null references sessions (id) on delete cascade,
  method text not null,
  path text not null,
  occurred_at timestamptz not null default now()
);

create index ix_impersonation_actions_tenant_id on impersonation_actions (tenant_id);
create index ix_impersonation_actions_session_id on impersonation_actions (session_id);

alter table impersonation_actions enable row level security;
alter table impersonation_actions force row level security;

create policy tenant_isolation on impersonation_actions
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
