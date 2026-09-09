create table class_journals (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  academic_year_id uuid not null references academic_years (id) on delete restrict,
  teacher_user_id uuid not null references users (id) on delete restrict,
  written_by_user_id uuid not null references users (id) on delete restrict,
  class_id uuid not null references classes (id) on delete cascade,
  subject_id uuid not null references subjects (id) on delete restrict,
  lesson_date date not null,
  topic text not null check (length(topic) <= 300),
  activities text not null,
  reflection text,
  attendance_session_id uuid references attendance_sessions (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academic_year_id, teacher_user_id, class_id, subject_id, lesson_date)
);

create index ix_class_journals_tenant_id on class_journals (tenant_id, academic_year_id);
create index ix_class_journals_class_id on class_journals (class_id, lesson_date desc);
create index ix_class_journals_teacher_id on class_journals (teacher_user_id, lesson_date desc);
create index ix_class_journals_attendance_session_id on class_journals (attendance_session_id);

alter table class_journals enable row level security;
alter table class_journals force row level security;

create policy tenant_isolation on class_journals
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create trigger trg_class_journals_set_updated_at
  before update on class_journals
  for each row execute function set_updated_at();
