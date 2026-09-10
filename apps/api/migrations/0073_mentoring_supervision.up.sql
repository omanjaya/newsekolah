-- Mentoring (guru wali) and supervision (docs/12-roadmap.md Fase 6), both
-- gated by feature_flags. Feature flags for these two modules are added in
-- migration 0058's platform console list via application code
-- (modules/platform/domain), not a database check constraint, matching how
-- feature_flags.module already accepts any text value.

create table mentor_group_settings (
  tenant_id uuid primary key references tenants (id) on delete cascade,
  group_size_limit integer not null default 15 check (group_size_limit >= 1),
  updated_at timestamptz not null default now()
);
alter table mentor_group_settings enable row level security;
alter table mentor_group_settings force row level security;
create policy tenant_isolation on mentor_group_settings
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table mentor_groups (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  academic_year_id uuid not null references academic_years (id) on delete cascade,
  mentor_user_id uuid not null references users (id),
  name text not null check (length(name) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ix_mentor_groups_tenant_id on mentor_groups (tenant_id);
create index ix_mentor_groups_year_mentor on mentor_groups (academic_year_id, mentor_user_id);
alter table mentor_groups enable row level security;
alter table mentor_groups force row level security;
create policy tenant_isolation on mentor_groups
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create trigger trg_mentor_groups_set_updated_at before update on mentor_groups
  for each row execute function set_updated_at();

create table mentor_group_members (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  group_id uuid not null references mentor_groups (id) on delete cascade,
  academic_year_id uuid not null references academic_years (id) on delete cascade,
  student_user_id uuid not null references users (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unique (academic_year_id, student_user_id)
);
create index ix_mentor_group_members_tenant_id on mentor_group_members (tenant_id);
create index ix_mentor_group_members_group on mentor_group_members (group_id);
alter table mentor_group_members enable row level security;
alter table mentor_group_members force row level security;
create policy tenant_isolation on mentor_group_members
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table mentor_meeting_notes (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  academic_year_id uuid not null references academic_years (id) on delete cascade,
  group_id uuid not null references mentor_groups (id) on delete cascade,
  mentor_user_id uuid not null references users (id),
  met_at timestamptz not null,
  kind text not null check (kind in ('group', 'individual')),
  attendee_user_ids uuid[] not null,
  topic text not null check (length(topic) <= 200),
  content_encrypted bytea not null,
  content_key_id text not null,
  agreed_actions_encrypted bytea,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ix_mentor_meeting_notes_tenant_id on mentor_meeting_notes (tenant_id);
create index ix_mentor_meeting_notes_group on mentor_meeting_notes (group_id, met_at desc);
alter table mentor_meeting_notes enable row level security;
alter table mentor_meeting_notes force row level security;
create policy tenant_isolation on mentor_meeting_notes
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create trigger trg_mentor_meeting_notes_set_updated_at before update on mentor_meeting_notes
  for each row execute function set_updated_at();

create table mentor_term_summaries (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  term_id uuid not null references terms (id) on delete cascade,
  group_id uuid not null references mentor_groups (id) on delete cascade,
  student_user_id uuid not null references users (id) on delete cascade,
  mentor_user_id uuid not null references users (id),
  summary text not null check (length(summary) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (term_id, student_user_id)
);
create index ix_mentor_term_summaries_tenant_id on mentor_term_summaries (tenant_id);
alter table mentor_term_summaries enable row level security;
alter table mentor_term_summaries force row level security;
create policy tenant_isolation on mentor_term_summaries
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create trigger trg_mentor_term_summaries_set_updated_at before update on mentor_term_summaries
  for each row execute function set_updated_at();

-- Supervision: leadership observing a teacher's lesson.

create table supervision_cycles (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  academic_year_id uuid not null references academic_years (id) on delete cascade,
  name text not null check (length(name) <= 160),
  instrument jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academic_year_id, name)
);
create index ix_supervision_cycles_tenant_id on supervision_cycles (tenant_id);
alter table supervision_cycles enable row level security;
alter table supervision_cycles force row level security;
create policy tenant_isolation on supervision_cycles
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create trigger trg_supervision_cycles_set_updated_at before update on supervision_cycles
  for each row execute function set_updated_at();

create table supervision_scheduled_observations (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  cycle_id uuid not null references supervision_cycles (id) on delete cascade,
  schedule_id uuid not null,
  lesson_date date not null,
  teacher_user_id uuid not null references users (id),
  observer_user_id uuid not null references users (id),
  created_at timestamptz not null default now(),
  unique (cycle_id, schedule_id, lesson_date)
);
create index ix_supervision_scheduled_tenant_id on supervision_scheduled_observations (tenant_id);
create index ix_supervision_scheduled_teacher on supervision_scheduled_observations (cycle_id, teacher_user_id);
alter table supervision_scheduled_observations enable row level security;
alter table supervision_scheduled_observations force row level security;
create policy tenant_isolation on supervision_scheduled_observations
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table supervision_observations (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  scheduled_id uuid not null unique references supervision_scheduled_observations (id) on delete cascade,
  cycle_id uuid not null references supervision_cycles (id) on delete cascade,
  teacher_user_id uuid not null references users (id),
  observer_user_id uuid not null references users (id),
  scores jsonb not null,
  observer_notes text not null check (length(observer_notes) <= 4000),
  teacher_response text not null default '' check (length(teacher_response) <= 4000),
  agreed_follow_up text not null default '' check (length(agreed_follow_up) <= 2000),
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ix_supervision_observations_tenant_id on supervision_observations (tenant_id);
create index ix_supervision_observations_teacher on supervision_observations (cycle_id, teacher_user_id);
alter table supervision_observations enable row level security;
alter table supervision_observations force row level security;
create policy tenant_isolation on supervision_observations
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create trigger trg_supervision_observations_set_updated_at before update on supervision_observations
  for each row execute function set_updated_at();
