-- A tenant could create two member types with the same name, and the
-- pickers then offered two identical options that may carry different
-- loan and fine rules. Names are unique per tenant among live types,
-- ignoring case and surrounding spaces.
--
-- Existing live duplicates are renamed first ("Siswa (2)", "Siswa (3)",
-- oldest keeps the plain name) so the index can be built.
with ranked as (
  select id, row_number() over (
    partition by tenant_id, lower(btrim(name)) order by created_at, id
  ) as n
  from library_member_types
  where deleted_at is null
)
update library_member_types t
set name = left(btrim(t.name), 100 - length(' (' || r.n || ')')) || ' (' || r.n || ')', updated_at = now()
from ranked r
where t.id = r.id and r.n > 1;

create unique index ux_library_member_types_name on library_member_types (tenant_id, lower(btrim(name)))
  where deleted_at is null;
