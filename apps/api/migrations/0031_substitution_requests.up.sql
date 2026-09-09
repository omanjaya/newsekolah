create table substitution_requests (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  academic_year_id uuid not null references academic_years (id) on delete restrict,
  schedule_id uuid not null references schedules (id) on delete cascade,
  date date not null,
  requester_user_id uuid not null references users (id) on delete cascade,
  substitute_user_id uuid not null references users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  requester_note text,
  response_note text,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  check (substitute_user_id <> requester_user_id)
);

-- Only one pending-or-accepted substitute request may exist for a given
-- schedule occurrence at a time; a rejected or cancelled one frees the slot
-- up for a new request.
create unique index ux_substitution_requests_active
  on substitution_requests (schedule_id, date)
  where status in ('pending', 'accepted');

create index ix_substitution_requests_tenant_id on substitution_requests (tenant_id, academic_year_id);
create index ix_substitution_requests_requester on substitution_requests (requester_user_id, date desc);
create index ix_substitution_requests_substitute on substitution_requests (substitute_user_id, date desc);
create index ix_substitution_requests_schedule_id on substitution_requests (schedule_id);

alter table substitution_requests enable row level security;
alter table substitution_requests force row level security;

create policy tenant_isolation on substitution_requests
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
