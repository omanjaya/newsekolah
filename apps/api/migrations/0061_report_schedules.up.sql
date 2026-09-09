-- Scheduled report exports (docs/12-roadmap.md, Fase 2): recurring
-- catalogue exports delivered by email, plus a run history so a failed
-- send is visible.
create table report_schedules (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  report_kind text not null check (length(report_kind) <= 64),
  params jsonb not null default '{}'::jsonb,
  cadence text not null check (cadence in ('daily', 'weekly', 'monthly')),
  weekday smallint check (weekday between 0 and 6),
  day_of_month smallint check (day_of_month between 1 and 31),
  hour smallint not null check (hour between 0 and 23),
  recipients text[] not null check (cardinality(recipients) between 1 and 10),
  enabled boolean not null default true,
  created_by uuid not null references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cadence <> 'weekly' or weekday is not null),
  check (cadence <> 'monthly' or day_of_month is not null)
);
create index ix_report_schedules_tenant_id on report_schedules (tenant_id);
create index ix_report_schedules_enabled_hour on report_schedules (tenant_id, hour) where enabled;
alter table report_schedules enable row level security;
alter table report_schedules force row level security;
create policy tenant_isolation on report_schedules
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create trigger trg_report_schedules_set_updated_at before update on report_schedules
  for each row execute function set_updated_at();

create table report_schedule_runs (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  schedule_id uuid not null references report_schedules (id) on delete cascade,
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'success', 'failed')),
  error_message text not null default '' check (length(error_message) <= 2000),
  object_key text not null default '',
  ran_at timestamptz,
  created_at timestamptz not null default now(),
  -- One run per schedule per due slot: the hourly job claims a slot with
  -- an insert that relies on this constraint to fail (harmlessly) if a
  -- second wake-up in the same hour tries the same schedule again.
  unique (schedule_id, due_at)
);
create index ix_report_schedule_runs_tenant_id on report_schedule_runs (tenant_id);
create index ix_report_schedule_runs_schedule on report_schedule_runs (schedule_id, due_at desc);
alter table report_schedule_runs enable row level security;
alter table report_schedule_runs force row level security;
create policy tenant_isolation on report_schedule_runs
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
