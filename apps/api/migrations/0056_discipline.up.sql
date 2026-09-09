-- Discipline and counseling (docs/06-database-schema.md section 8).
create table violation_types (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  code text not null check (length(code) <= 32),
  name text not null check (length(name) <= 160),
  points integer not null check (points >= 0),
  category text not null default 'general' check (length(category) <= 60),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, code)
);
create index ix_violation_types_tenant_id on violation_types (tenant_id);
alter table violation_types enable row level security;
alter table violation_types force row level security;
create policy tenant_isolation on violation_types
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create trigger trg_violation_types_set_updated_at before update on violation_types
  for each row execute function set_updated_at();

create table violation_records (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  academic_year_id uuid not null references academic_years (id) on delete cascade,
  student_user_id uuid not null references users (id) on delete cascade,
  violation_type_id uuid not null references violation_types (id),
  points_snapshot integer not null check (points_snapshot >= 0),
  occurred_on date not null,
  attendance_session_id uuid,
  workflow_instance_id uuid,
  reporter_user_id uuid not null references users (id),
  notes text not null default '' check (length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid,
  void_reason text
);
create index ix_violation_records_tenant_id on violation_records (tenant_id);
create index ix_violation_records_student on violation_records (academic_year_id, student_user_id, occurred_on desc);
alter table violation_records enable row level security;
alter table violation_records force row level security;
create policy tenant_isolation on violation_records
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create trigger trg_violation_records_set_updated_at before update on violation_records
  for each row execute function set_updated_at();

create table warning_letters (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  academic_year_id uuid not null references academic_years (id) on delete cascade,
  student_user_id uuid not null references users (id) on delete cascade,
  level integer not null check (level > 0),
  level_label text not null,
  threshold_points integer not null,
  total_points integer not null,
  letter_number text not null,
  issued_by uuid references users (id),
  issued_at timestamptz not null default now(),
  snapshot jsonb not null default '{}'::jsonb,
  document_asset_id uuid references assets (id),
  unique (academic_year_id, student_user_id, level),
  unique (tenant_id, academic_year_id, letter_number)
);
create index ix_warning_letters_tenant_id on warning_letters (tenant_id);
alter table warning_letters enable row level security;
alter table warning_letters force row level security;
create policy tenant_isolation on warning_letters
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table counselings (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  academic_year_id uuid not null references academic_years (id) on delete cascade,
  student_user_id uuid not null references users (id) on delete cascade,
  counselor_user_id uuid not null references users (id),
  session_at timestamptz not null,
  kind text not null check (kind in ('individual', 'group', 'parent', 'referral')),
  title text not null check (length(title) <= 160),
  content_encrypted bytea not null,
  content_key_id text not null,
  follow_up_plan_encrypted bytea,
  visibility text not null default 'counselor' check (visibility in ('counselor', 'bk_team', 'leadership')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ix_counselings_tenant_id on counselings (tenant_id);
create index ix_counselings_student on counselings (academic_year_id, student_user_id, session_at desc);
alter table counselings enable row level security;
alter table counselings force row level security;
create policy tenant_isolation on counselings
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create trigger trg_counselings_set_updated_at before update on counselings
  for each row execute function set_updated_at();

create table counseling_attachments (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  counseling_id uuid not null references counselings (id) on delete cascade,
  asset_id uuid not null references assets (id),
  created_at timestamptz not null default now()
);
create index ix_counseling_attachments_tenant_id on counseling_attachments (tenant_id);
alter table counseling_attachments enable row level security;
alter table counseling_attachments force row level security;
create policy tenant_isolation on counseling_attachments
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
