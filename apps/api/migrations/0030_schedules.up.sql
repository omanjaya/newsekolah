-- btree_gist lets a GiST exclusion constraint mix plain equality (=) on
-- uuid/smallint columns with range overlap (&&) on period_range in the same
-- index, which is what makes the anti-clash constraints below possible.
create extension if not exists btree_gist;

create table schedules (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  academic_year_id uuid not null references academic_years (id) on delete restrict,
  term_id uuid references terms (id) on delete set null,
  class_id uuid not null references classes (id) on delete cascade,
  subject_id uuid not null references subjects (id) on delete restrict,
  teacher_user_id uuid not null references users (id) on delete restrict,
  room_id uuid references rooms (id) on delete set null,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  start_period_id uuid not null references periods (id) on delete restrict,
  end_period_id uuid not null references periods (id) on delete restrict,
  -- Denormalized copies of periods.sequence for start/end, set by the
  -- service layer when it resolves the period IDs: the exclusion
  -- constraint below needs a plain integer range to compare, and a
  -- generated column cannot look sequence up through a join.
  start_seq smallint not null check (start_seq > 0),
  end_seq smallint not null check (end_seq >= start_seq),
  period_range int4range generated always as (int4range(start_seq::int, end_seq::int, '[]')) stored,
  source text not null default 'admin' check (source in ('admin', 'teacher', 'import')),
  notes text,
  created_by uuid references users (id) on delete set null,
  updated_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Anti-clash, per docs/06-database-schema.md section 5: a class cannot
  -- have two schedules on the same day whose period ranges overlap, and
  -- neither can a teacher, both scoped to one academic year so a
  -- retired/archived year's schedules never block a new one.
  exclude using gist (
    academic_year_id with =,
    class_id with =,
    day_of_week with =,
    period_range with &&
  ),
  exclude using gist (
    academic_year_id with =,
    teacher_user_id with =,
    day_of_week with =,
    period_range with &&
  )
);

create index ix_schedules_tenant_id on schedules (tenant_id, academic_year_id);
create index ix_schedules_class_id on schedules (class_id, day_of_week);
create index ix_schedules_teacher_user_id on schedules (teacher_user_id, day_of_week);
create index ix_schedules_room_id on schedules (room_id);
create index ix_schedules_start_period_id on schedules (start_period_id);
create index ix_schedules_end_period_id on schedules (end_period_id);

alter table schedules enable row level security;
alter table schedules force row level security;

create policy tenant_isolation on schedules
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create trigger trg_schedules_set_updated_at
  before update on schedules
  for each row execute function set_updated_at();
