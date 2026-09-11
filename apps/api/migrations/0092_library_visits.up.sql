-- Library visits (guest book) and read-in-place logging (old app's
-- library_visits and library_read_in_place), separate from the visitors
-- module which is campus guests/security rather than library patrons.
create table library_visits (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  member_user_id uuid references users (id) on delete set null,
  visitor_name text not null default '' check (length(visitor_name) <= 150),
  kind text not null check (kind in ('member', 'non_member', 'group')),
  purpose text not null default '' check (length(purpose) <= 200),
  group_size int not null default 1 check (group_size > 0),
  source text not null default 'manual' check (source in ('manual', 'scan', 'kiosk')),
  visited_at timestamptz not null,
  created_by uuid references users (id),
  created_at timestamptz not null default now()
);
create index ix_library_visits_tenant_time on library_visits (tenant_id, visited_at desc);
create index ix_library_visits_member_recent on library_visits (tenant_id, member_user_id, visited_at desc)
  where member_user_id is not null;
alter table library_visits enable row level security;
alter table library_visits force row level security;
create policy tenant_isolation on library_visits
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table library_read_in_place (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  copy_id uuid not null references library_copies (id) on delete cascade,
  member_user_id uuid references users (id) on delete set null,
  visitor_name text not null default '' check (length(visitor_name) <= 150),
  started_at timestamptz not null,
  ended_at timestamptz,
  created_by uuid references users (id),
  created_at timestamptz not null default now()
);
create index ix_library_read_in_place_tenant_id on library_read_in_place (tenant_id);
create index ix_library_read_in_place_copy on library_read_in_place (tenant_id, copy_id, started_at desc);
alter table library_read_in_place enable row level security;
alter table library_read_in_place force row level security;
create policy tenant_isolation on library_read_in_place
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
