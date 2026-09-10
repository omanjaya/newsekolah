-- Early-warning analytics (docs/12-roadmap.md Fase 5, "Analitik peringatan
-- dini v1"): a per-student risk level computed from signals the platform
-- already holds (attendance, discipline, report scores), recomputed on a
-- schedule and stored so the list view never recomputes on read.
--
-- The tenant policy (weights and thresholds) lives in its own table rather
-- than widening tenant_policies.kind's CHECK constraint, which lists a
-- fixed set of kinds owned by other modules and is not this module's file
-- to alter while other agents are working in parallel worktrees.

create table analytics_policies (
  tenant_id uuid not null references tenants (id) on delete cascade,
  version int not null check (version > 0),
  config jsonb not null,
  effective_from date not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (tenant_id, version)
);

alter table analytics_policies enable row level security;
alter table analytics_policies force row level security;

create policy tenant_isolation on analytics_policies
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create policy platform_access on analytics_policies
  using (current_setting('app.platform_admin', true) = 'true')
  with check (current_setting('app.platform_admin', true) = 'true');

-- One row per student per academic year: the River recompute job upserts
-- it, the list and detail screens only ever read it. signals and reasons
-- are stored as the domain returned them (reasons: a code plus the
-- observed numbers, never a characterisation of the student) so the
-- detail screen renders without recomputing.
create table analytics_student_risk (
  tenant_id uuid not null references tenants (id) on delete cascade,
  academic_year_id uuid not null references academic_years (id) on delete cascade,
  student_user_id uuid not null references users (id) on delete cascade,
  class_id uuid references classes (id) on delete set null,
  level text not null check (level in ('none', 'watch', 'at_risk')),
  score int not null default 0,
  signals jsonb not null default '{}',
  reasons jsonb not null default '[]',
  policy_version int not null default 1,
  computed_at timestamptz not null default now(),
  primary key (tenant_id, academic_year_id, student_user_id)
);

-- The list view's two access patterns: leadership/counselor scan the whole
-- year, a homeroom teacher scans one class -- both ordered by score so the
-- most urgent students sort first.
create index ix_analytics_student_risk_year_score
  on analytics_student_risk (tenant_id, academic_year_id, score desc);
create index ix_analytics_student_risk_class_score
  on analytics_student_risk (tenant_id, academic_year_id, class_id, score desc);

alter table analytics_student_risk enable row level security;
alter table analytics_student_risk force row level security;

create policy tenant_isolation on analytics_student_risk
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
