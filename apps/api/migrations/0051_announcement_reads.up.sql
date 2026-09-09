create table announcement_reads (
  announcement_id uuid not null references announcements (id) on delete cascade,
  user_id uuid not null,
  tenant_id uuid not null references tenants (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

create index ix_announcement_reads_tenant_id on announcement_reads (tenant_id);
create index ix_announcement_reads_user_id on announcement_reads (user_id);

alter table announcement_reads enable row level security;
alter table announcement_reads force row level security;

create policy tenant_isolation on announcement_reads
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
