create table document_templates (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  kind text not null check (kind in (
    'leave_letter', 'warning_letter', 'class_journal', 'member_card', 'item_label', 'clearance_letter', 'report'
  )),
  name text not null check (length(name) <= 150),
  engine text not null check (engine in ('html', 'docx')),
  body text not null,
  variables jsonb not null default '[]'::jsonb,
  is_default boolean not null default false,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index ix_document_templates_tenant_id on document_templates (tenant_id, kind);
create unique index ux_document_templates_default on document_templates (tenant_id, kind)
  where is_default and deleted_at is null;

alter table document_templates enable row level security;
alter table document_templates force row level security;

create policy tenant_isolation on document_templates
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create trigger trg_document_templates_set_updated_at
  before update on document_templates
  for each row execute function set_updated_at();
