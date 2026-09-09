-- Document numbering source of truth. Bug fix vs. the old app
-- (docs/analysis/backend-inventory.md 1.14/1.17,
-- docs/analysis/database-inventory.md 1.6, 08-security.md section 7):
-- numbers come from `UPDATE ... RETURNING next_value` inside the issuing
-- transaction, never `COUNT(*) + 1`, so two concurrent issuances cannot
-- collide.
create table document_sequences (
  tenant_id uuid not null references tenants (id) on delete cascade,
  kind text not null,
  academic_year_id uuid not null references academic_years (id) on delete cascade,
  next_value bigint not null default 1 check (next_value > 0),
  primary key (tenant_id, kind, academic_year_id)
);

alter table document_sequences enable row level security;
alter table document_sequences force row level security;

create policy tenant_isolation on document_sequences
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
