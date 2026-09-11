-- Library catalogue master data: material types, collection categories,
-- acquisition sources, partners, locations, and the read-only DDC class
-- list. docs/06-database-schema.md:246-248 plans these as part of the
-- catalogue; migration 0062 only shipped the minimal circulation tables.

create table library_material_types (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  code text not null check (length(code) between 1 and 32),
  name text not null check (length(name) between 1 and 120),
  max_loan_items int not null default 2 check (max_loan_items > 0),
  max_loan_days int not null default 7 check (max_loan_days > 0),
  max_renewals int not null default 1 check (max_renewals >= 0),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);
alter table library_material_types enable row level security;
alter table library_material_types force row level security;
create policy tenant_isolation on library_material_types
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create trigger trg_library_material_types_set_updated_at before update on library_material_types
  for each row execute function set_updated_at();

create table library_collection_categories (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  code text not null check (length(code) between 1 and 32),
  name text not null check (length(name) between 1 and 120),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);
alter table library_collection_categories enable row level security;
alter table library_collection_categories force row level security;
create policy tenant_isolation on library_collection_categories
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create trigger trg_library_collection_categories_set_updated_at before update on library_collection_categories
  for each row execute function set_updated_at();

create table library_acquisition_sources (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  code text not null check (length(code) between 1 and 32),
  name text not null check (length(name) between 1 and 120),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);
alter table library_acquisition_sources enable row level security;
alter table library_acquisition_sources force row level security;
create policy tenant_isolation on library_acquisition_sources
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create trigger trg_library_acquisition_sources_set_updated_at before update on library_acquisition_sources
  for each row execute function set_updated_at();

create table library_partners (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  code text not null check (length(code) between 1 and 32),
  name text not null check (length(name) between 1 and 200),
  contact_name text not null default '' check (length(contact_name) <= 120),
  phone text not null default '' check (length(phone) <= 40),
  address text not null default '' check (length(address) <= 300),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);
alter table library_partners enable row level security;
alter table library_partners force row level security;
create policy tenant_isolation on library_partners
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create trigger trg_library_partners_set_updated_at before update on library_partners
  for each row execute function set_updated_at();

create table library_locations (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  code text not null check (length(code) between 1 and 32),
  name text not null check (length(name) between 1 and 120),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);
alter table library_locations enable row level security;
alter table library_locations force row level security;
create policy tenant_isolation on library_locations
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create trigger trg_library_locations_set_updated_at before update on library_locations
  for each row execute function set_updated_at();

-- DDC classes are a fixed platform reference list (no tenant_id), same
-- shape as the old app's read-only lookup: the ten top-level Dewey
-- Decimal classes.
create table library_ddc_classes (
  code text primary key check (code ~ '^[0-9]00$'),
  name text not null
);
insert into library_ddc_classes (code, name) values
  ('000', 'Karya Umum'),
  ('100', 'Filsafat dan Psikologi'),
  ('200', 'Agama'),
  ('300', 'Ilmu Sosial'),
  ('400', 'Bahasa'),
  ('500', 'Sains'),
  ('600', 'Teknologi dan Ilmu Terapan'),
  ('700', 'Kesenian dan Rekreasi'),
  ('800', 'Sastra'),
  ('900', 'Sejarah dan Geografi');
