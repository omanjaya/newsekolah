-- Activities module: extracurricular clubs and their membership and
-- meeting attendance, one-off school activities/events with participants,
-- and a per-student achievement record. Gated by the platform's per-tenant
-- module flag (school.feature_flags, module = 'activities'); see
-- apps/api/internal/modules/platform/domain/platform.go.
--
-- Meeting attendance reuses the small local status vocabulary defined in
-- domain (Hadir/Izin/Sakit/Alpha) rather than the tenant-configurable
-- attendance_statuses policy: that policy is only reachable through the
-- attendance module's unexported loadStatusPolicy, so there is no adapter
-- to read it through today (docs/03-layered-architecture.md section 1
-- requires an exported reader interface for cross-module reads, and
-- attendance does not currently export one for its status catalog).

create table extracurriculars (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  academic_year_id uuid not null references academic_years (id) on delete restrict,
  name text not null check (length(name) <= 150),
  description text not null default '' check (length(description) <= 2000),
  coach_user_id uuid references users (id) on delete set null,
  capacity int check (capacity is null or capacity > 0),
  meeting_day smallint check (meeting_day between 0 and 6),
  meeting_start time,
  meeting_end time check (meeting_end is null or meeting_start is null or meeting_end > meeting_start),
  location text not null default '' check (length(location) <= 150),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (academic_year_id, name)
);

create index ix_extracurriculars_tenant_id on extracurriculars (tenant_id, academic_year_id);
create index ix_extracurriculars_coach on extracurriculars (coach_user_id);

alter table extracurriculars enable row level security;
alter table extracurriculars force row level security;
create policy tenant_isolation on extracurriculars
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create trigger trg_extracurriculars_set_updated_at before update on extracurriculars
  for each row execute function set_updated_at();

-- Membership policy (currently just the per-student club cap) versioned
-- the same way discipline and library keep their own policy tables,
-- since tenant_policies.kind has a fixed CHECK list that does not include
-- an "activities" kind.
create table activities_policies (
  tenant_id uuid not null references tenants (id) on delete cascade,
  version int not null check (version > 0),
  config jsonb not null,
  effective_from date not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (tenant_id, version)
);
alter table activities_policies enable row level security;
alter table activities_policies force row level security;
create policy tenant_isolation on activities_policies
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table extracurricular_memberships (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  extracurricular_id uuid not null references extracurriculars (id) on delete cascade,
  student_user_id uuid not null references users (id) on delete cascade,
  joined_on date not null,
  left_on date check (left_on is null or left_on >= joined_on),
  status text not null default 'active' check (status in ('active', 'left')),
  -- one active membership per student per club at a time; rejoining after
  -- leaving inserts a new row instead of reusing the old one, so history
  -- of separate stints is kept.
  active_key uuid generated always as (case when status = 'active' then extracurricular_id end) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (active_key, student_user_id)
);

create index ix_extracurricular_memberships_tenant_id on extracurricular_memberships (tenant_id);
create index ix_extracurricular_memberships_club on extracurricular_memberships (extracurricular_id, status);
create index ix_extracurricular_memberships_student on extracurricular_memberships (student_user_id, status);

alter table extracurricular_memberships enable row level security;
alter table extracurricular_memberships force row level security;
create policy tenant_isolation on extracurricular_memberships
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create trigger trg_extracurricular_memberships_set_updated_at before update on extracurricular_memberships
  for each row execute function set_updated_at();

create table extracurricular_meetings (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  extracurricular_id uuid not null references extracurriculars (id) on delete cascade,
  meeting_date date not null,
  notes text not null default '' check (length(notes) <= 1000),
  created_at timestamptz not null default now(),
  unique (extracurricular_id, meeting_date)
);

create index ix_extracurricular_meetings_tenant_id on extracurricular_meetings (tenant_id);
create index ix_extracurricular_meetings_club on extracurricular_meetings (extracurricular_id, meeting_date);

alter table extracurricular_meetings enable row level security;
alter table extracurricular_meetings force row level security;
create policy tenant_isolation on extracurricular_meetings
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table extracurricular_attendance (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  meeting_id uuid not null references extracurricular_meetings (id) on delete cascade,
  student_user_id uuid not null references users (id) on delete cascade,
  -- local status vocabulary (see module comment above): H, I, S, A.
  status_code text not null check (status_code in ('H', 'I', 'S', 'A')),
  notes text not null default '' check (length(notes) <= 500),
  recorded_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (meeting_id, student_user_id)
);

create index ix_extracurricular_attendance_tenant_id on extracurricular_attendance (tenant_id);
create index ix_extracurricular_attendance_meeting on extracurricular_attendance (meeting_id);
create index ix_extracurricular_attendance_student on extracurricular_attendance (student_user_id);

alter table extracurricular_attendance enable row level security;
alter table extracurricular_attendance force row level security;
create policy tenant_isolation on extracurricular_attendance
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create trigger trg_extracurricular_attendance_set_updated_at before update on extracurricular_attendance
  for each row execute function set_updated_at();

-- One-off school activities/events (field trips, competitions, ceremonies),
-- distinct from the recurring extracurricular clubs above.
create table school_activities (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  academic_year_id uuid not null references academic_years (id) on delete restrict,
  name text not null check (length(name) <= 200),
  description text not null default '' check (length(description) <= 4000),
  location text not null default '' check (length(location) <= 200),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  organiser_user_id uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index ix_school_activities_tenant_id on school_activities (tenant_id, academic_year_id);
create index ix_school_activities_dates on school_activities (tenant_id, start_date, end_date);

alter table school_activities enable row level security;
alter table school_activities force row level security;
create policy tenant_isolation on school_activities
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create trigger trg_school_activities_set_updated_at before update on school_activities
  for each row execute function set_updated_at();

-- A participant is either a whole class, a whole grade level, or one named
-- student; exactly one of the three reference columns is set, enforced by
-- the check below so a row can never mean two things at once.
create table activity_participants (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  activity_id uuid not null references school_activities (id) on delete cascade,
  class_id uuid references classes (id) on delete cascade,
  grade_level_id uuid references grade_levels (id) on delete cascade,
  student_user_id uuid references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (
    (case when class_id is not null then 1 else 0 end
      + case when grade_level_id is not null then 1 else 0 end
      + case when student_user_id is not null then 1 else 0 end) = 1
  )
);

create index ix_activity_participants_tenant_id on activity_participants (tenant_id);
create index ix_activity_participants_activity on activity_participants (activity_id);
create unique index ux_activity_participants_class on activity_participants (activity_id, class_id) where class_id is not null;
create unique index ux_activity_participants_grade on activity_participants (activity_id, grade_level_id) where grade_level_id is not null;
create unique index ux_activity_participants_student on activity_participants (activity_id, student_user_id) where student_user_id is not null;

alter table activity_participants enable row level security;
alter table activity_participants force row level security;
create policy tenant_isolation on activity_participants
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table student_achievements (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  academic_year_id uuid not null references academic_years (id) on delete restrict,
  student_user_id uuid not null references users (id) on delete cascade,
  competition_name text not null check (length(competition_name) <= 200),
  level text not null check (level in ('school', 'district', 'city', 'province', 'national', 'international')),
  placement text not null check (length(placement) <= 100),
  achieved_on date not null,
  notes text not null default '' check (length(notes) <= 1000),
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index ix_student_achievements_tenant_id on student_achievements (tenant_id, academic_year_id);
create index ix_student_achievements_student on student_achievements (student_user_id);

alter table student_achievements enable row level security;
alter table student_achievements force row level security;
create policy tenant_isolation on student_achievements
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create trigger trg_student_achievements_set_updated_at before update on student_achievements
  for each row execute function set_updated_at();
