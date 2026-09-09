create table academic_years (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  label text not null check (length(label) <= 20),
  starts_on date not null,
  ends_on date not null check (ends_on > starts_on),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, label)
);

create unique index ux_active_year on academic_years (tenant_id) where is_active;
create index ix_academic_years_tenant_id on academic_years (tenant_id);

alter table academic_years enable row level security;
alter table academic_years force row level security;

create policy tenant_isolation on academic_years
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create trigger trg_academic_years_set_updated_at
  before update on academic_years
  for each row execute function set_updated_at();

create table terms (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  academic_year_id uuid not null references academic_years (id) on delete cascade,
  name text not null check (length(name) <= 50),
  sequence smallint not null check (sequence > 0),
  starts_on date not null,
  ends_on date not null check (ends_on > starts_on),
  is_active boolean not null default false,
  unique (academic_year_id, sequence)
);

create index ix_terms_tenant_id on terms (tenant_id);
create index ix_terms_academic_year_id on terms (academic_year_id);

alter table terms enable row level security;
alter table terms force row level security;

create policy tenant_isolation on terms
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table academic_calendar_events (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  academic_year_id uuid not null references academic_years (id) on delete cascade,
  date date not null,
  kind text not null check (kind in ('holiday', 'exam', 'event', 'no_school')),
  name text not null check (length(name) <= 150)
);

create index ix_academic_calendar_events_tenant_id on academic_calendar_events (tenant_id, academic_year_id);
create index ix_academic_calendar_events_academic_year_id on academic_calendar_events (academic_year_id);
create index ix_academic_calendar_events_date on academic_calendar_events (date);

alter table academic_calendar_events enable row level security;
alter table academic_calendar_events force row level security;

create policy tenant_isolation on academic_calendar_events
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table grade_levels (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  code text not null check (length(code) <= 20),
  name text not null check (length(name) <= 100),
  sequence smallint not null,
  unique (tenant_id, code)
);

create index ix_grade_levels_tenant_id on grade_levels (tenant_id);

alter table grade_levels enable row level security;
alter table grade_levels force row level security;

create policy tenant_isolation on grade_levels
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table tracks (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  code text not null check (length(code) <= 20),
  name text not null check (length(name) <= 100),
  unique (tenant_id, code)
);

create index ix_tracks_tenant_id on tracks (tenant_id);

alter table tracks enable row level security;
alter table tracks force row level security;

create policy tenant_isolation on tracks
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table rooms (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  code text not null check (length(code) <= 20),
  name text not null check (length(name) <= 100),
  capacity int check (capacity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, code)
);

create index ix_rooms_tenant_id on rooms (tenant_id);

alter table rooms enable row level security;
alter table rooms force row level security;

create policy tenant_isolation on rooms
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create trigger trg_rooms_set_updated_at
  before update on rooms
  for each row execute function set_updated_at();

create table classes (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  academic_year_id uuid not null references academic_years (id) on delete restrict,
  grade_level_id uuid not null references grade_levels (id) on delete restrict,
  track_id uuid references tracks (id) on delete set null,
  name text not null check (length(name) <= 100),
  room_id uuid references rooms (id) on delete set null,
  capacity int check (capacity >= 0),
  homeroom_teacher_id uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (academic_year_id, name)
);

create index ix_classes_tenant_id on classes (tenant_id, academic_year_id);
create index ix_classes_grade_level_id on classes (grade_level_id);
create index ix_classes_track_id on classes (track_id);
create index ix_classes_room_id on classes (room_id);
create index ix_classes_homeroom_teacher_id on classes (homeroom_teacher_id);

alter table classes enable row level security;
alter table classes force row level security;

create policy tenant_isolation on classes
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create trigger trg_classes_set_updated_at
  before update on classes
  for each row execute function set_updated_at();

create table enrollments (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  academic_year_id uuid not null references academic_years (id) on delete restrict,
  student_user_id uuid not null references users (id) on delete cascade,
  class_id uuid not null references classes (id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'moved', 'graduated', 'left')),
  joined_on date not null,
  left_on date,
  created_at timestamptz not null default now()
);

create unique index ux_active_enrollment on enrollments (academic_year_id, student_user_id) where status = 'active';
create index ix_enrollments_tenant_id on enrollments (tenant_id, academic_year_id);
create index ix_enrollments_class_id on enrollments (class_id);
create index ix_enrollments_student_user_id on enrollments (student_user_id);

alter table enrollments enable row level security;
alter table enrollments force row level security;

create policy tenant_isolation on enrollments
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table subjects (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  code text not null check (length(code) <= 20),
  name text not null check (length(name) <= 150),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, code)
);

create index ix_subjects_tenant_id on subjects (tenant_id);

alter table subjects enable row level security;
alter table subjects force row level security;

create policy tenant_isolation on subjects
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create trigger trg_subjects_set_updated_at
  before update on subjects
  for each row execute function set_updated_at();

create table subject_offerings (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  academic_year_id uuid not null references academic_years (id) on delete cascade,
  subject_id uuid not null references subjects (id) on delete cascade,
  grade_level_id uuid references grade_levels (id) on delete set null,
  hours_per_week smallint not null check (hours_per_week > 0)
);

create index ix_subject_offerings_tenant_id on subject_offerings (tenant_id, academic_year_id);
create index ix_subject_offerings_subject_id on subject_offerings (subject_id);
create index ix_subject_offerings_grade_level_id on subject_offerings (grade_level_id);

alter table subject_offerings enable row level security;
alter table subject_offerings force row level security;

create policy tenant_isolation on subject_offerings
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table period_templates (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  name text not null check (length(name) <= 100),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ix_period_templates_tenant_id on period_templates (tenant_id);

alter table period_templates enable row level security;
alter table period_templates force row level security;

create policy tenant_isolation on period_templates
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create trigger trg_period_templates_set_updated_at
  before update on period_templates
  for each row execute function set_updated_at();

create table periods (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  template_id uuid not null references period_templates (id) on delete cascade,
  name text not null check (length(name) <= 50),
  sequence smallint not null check (sequence > 0),
  starts_at time not null,
  ends_at time not null,
  is_break boolean not null default false,
  check (starts_at < ends_at),
  unique (template_id, sequence)
);

create index ix_periods_tenant_id on periods (tenant_id);
create index ix_periods_template_id on periods (template_id);

alter table periods enable row level security;
alter table periods force row level security;

create policy tenant_isolation on periods
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table period_day_assignments (
  tenant_id uuid not null references tenants (id) on delete cascade,
  academic_year_id uuid not null references academic_years (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  template_id uuid not null references period_templates (id) on delete restrict,
  primary key (academic_year_id, day_of_week)
);

create index ix_period_day_assignments_tenant_id on period_day_assignments (tenant_id, academic_year_id);
create index ix_period_day_assignments_template_id on period_day_assignments (template_id);

alter table period_day_assignments enable row level security;
alter table period_day_assignments force row level security;

create policy tenant_isolation on period_day_assignments
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table school_days (
  tenant_id uuid not null references tenants (id) on delete cascade,
  academic_year_id uuid not null references academic_years (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  is_active boolean not null default true,
  primary key (academic_year_id, day_of_week)
);

create index ix_school_days_tenant_id on school_days (tenant_id, academic_year_id);

alter table school_days enable row level security;
alter table school_days force row level security;

create policy tenant_isolation on school_days
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table teaching_assignments (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  academic_year_id uuid not null references academic_years (id) on delete cascade,
  teacher_user_id uuid not null references users (id) on delete cascade,
  subject_id uuid not null references subjects (id) on delete cascade,
  class_id uuid not null references classes (id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academic_year_id, teacher_user_id, subject_id, class_id)
);

create index ix_teaching_assignments_tenant_id on teaching_assignments (tenant_id, academic_year_id);
create index ix_teaching_assignments_teacher_user_id on teaching_assignments (teacher_user_id);
create index ix_teaching_assignments_subject_id on teaching_assignments (subject_id);
create index ix_teaching_assignments_class_id on teaching_assignments (class_id);

alter table teaching_assignments enable row level security;
alter table teaching_assignments force row level security;

create policy tenant_isolation on teaching_assignments
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create trigger trg_teaching_assignments_set_updated_at
  before update on teaching_assignments
  for each row execute function set_updated_at();

-- Deferred FKs: these columns were created in 0002, before academic_years
-- and classes existed.
alter table user_roles
  add constraint fk_user_roles_academic_year foreign key (academic_year_id) references academic_years (id) on delete set null;

alter table duty_assignments
  add constraint fk_duty_assignments_academic_year foreign key (academic_year_id) references academic_years (id) on delete restrict;

alter table duty_assignments
  add constraint fk_duty_assignments_scope_class foreign key (scope_class_id) references classes (id) on delete cascade;
