-- Grading (docs/06-database-schema.md section 9).
create table assessment_components (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  academic_year_id uuid not null references academic_years (id) on delete cascade,
  term_id uuid not null references terms (id) on delete cascade,
  teacher_user_id uuid not null references users (id),
  class_id uuid not null references classes (id) on delete cascade,
  subject_id uuid not null references subjects (id),
  code text not null check (length(code) <= 32),
  kind text not null check (kind in ('formative', 'summative', 'project', 'practical', 'attitude', 'other')),
  description text not null default '' check (length(description) <= 500),
  kktp numeric(5,2),
  weight numeric(5,2) not null default 1 check (weight > 0),
  sequence smallint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academic_year_id, term_id, class_id, subject_id, code)
);
create index ix_assessment_components_tenant_id on assessment_components (tenant_id);
create index ix_assessment_components_scope on assessment_components (term_id, class_id, subject_id, sequence);
alter table assessment_components enable row level security;
alter table assessment_components force row level security;
create policy tenant_isolation on assessment_components
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create trigger trg_assessment_components_set_updated_at before update on assessment_components
  for each row execute function set_updated_at();

create table grades (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  component_id uuid not null references assessment_components (id) on delete cascade,
  student_user_id uuid not null references users (id) on delete cascade,
  score numeric(6,2) not null check (score >= 0),
  recorded_by uuid references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (component_id, student_user_id)
);
create index ix_grades_tenant_id on grades (tenant_id);
create index ix_grades_student on grades (student_user_id);
alter table grades enable row level security;
alter table grades force row level security;
create policy tenant_isolation on grades
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create trigger trg_grades_set_updated_at before update on grades
  for each row execute function set_updated_at();

create table grade_publications (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  academic_year_id uuid not null references academic_years (id) on delete cascade,
  term_id uuid not null references terms (id) on delete cascade,
  class_id uuid not null references classes (id) on delete cascade,
  subject_id uuid not null references subjects (id),
  is_published boolean not null default false,
  published_at timestamptz,
  published_by uuid references users (id),
  unique (academic_year_id, term_id, class_id, subject_id)
);
create index ix_grade_publications_tenant_id on grade_publications (tenant_id);
alter table grade_publications enable row level security;
alter table grade_publications force row level security;
create policy tenant_isolation on grade_publications
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table report_scores (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  academic_year_id uuid not null references academic_years (id) on delete cascade,
  term_id uuid not null references terms (id) on delete cascade,
  class_id uuid not null references classes (id) on delete cascade,
  subject_id uuid not null references subjects (id),
  student_user_id uuid not null references users (id) on delete cascade,
  previous_score numeric(6,2),
  manual_score numeric(6,2),
  final_score numeric(6,2) not null,
  computed_at timestamptz not null default now(),
  unique (academic_year_id, term_id, class_id, subject_id, student_user_id)
);
create index ix_report_scores_tenant_id on report_scores (tenant_id);
alter table report_scores enable row level security;
alter table report_scores force row level security;
create policy tenant_isolation on report_scores
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table report_grade_ranges (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  academic_year_id uuid not null references academic_years (id) on delete cascade,
  subject_id uuid references subjects (id),
  teacher_user_id uuid references users (id),
  min_score numeric(6,2) not null,
  max_score numeric(6,2) not null,
  increase_amount numeric(6,2) not null default 0,
  check (min_score <= max_score)
);
create index ix_report_grade_ranges_tenant_id on report_grade_ranges (tenant_id);
alter table report_grade_ranges enable row level security;
alter table report_grade_ranges force row level security;
create policy tenant_isolation on report_grade_ranges
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table report_tp_mappings (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  component_id uuid not null unique references assessment_components (id) on delete cascade,
  export_code text not null check (length(export_code) <= 32),
  r_min numeric(6,2), r_max numeric(6,2), t_min numeric(6,2), t_max numeric(6,2)
);
create index ix_report_tp_mappings_tenant_id on report_tp_mappings (tenant_id);
alter table report_tp_mappings enable row level security;
alter table report_tp_mappings force row level security;
create policy tenant_isolation on report_tp_mappings
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table star_events (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  academic_year_id uuid not null references academic_years (id) on delete cascade,
  class_id uuid not null references classes (id) on delete cascade,
  subject_id uuid references subjects (id),
  student_user_id uuid not null references users (id) on delete cascade,
  teacher_user_id uuid not null references users (id),
  delta integer not null check (delta <> 0),
  note text not null default '' check (length(note) <= 300),
  visible_to_student boolean not null default true,
  created_at timestamptz not null default now()
);
create index ix_star_events_tenant_id on star_events (tenant_id);
create index ix_star_events_student on star_events (academic_year_id, student_user_id, created_at desc);
alter table star_events enable row level security;
alter table star_events force row level security;
create policy tenant_isolation on star_events
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
