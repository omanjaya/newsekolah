-- A tenant could create two member types with the same name, and the
-- pickers then offered two identical options that may carry different
-- loan and fine rules. Names are unique per tenant among live types,
-- ignoring case and surrounding spaces.
--
-- Existing live duplicates are renamed first ("Siswa (2)", "Siswa (3)",
-- oldest keeps the plain name) so the index can be built. A suffix whose
-- name a live type already uses ("Siswa (2)" typed by hand) is skipped for
-- the next free number, or the index below would fail and stop the deploy.
do $$
declare
  dup record;
  candidate text;
  n int;
begin
  for dup in
    select id, tenant_id, btrim(name) as name, rn
    from (
      select id, tenant_id, name, row_number() over (
        partition by tenant_id, lower(btrim(name)) order by created_at, id
      ) as rn
      from library_member_types
      where deleted_at is null
    ) ranked
    where rn > 1
    order by tenant_id, lower(btrim(name)), rn
  loop
    n := dup.rn;
    loop
      candidate := left(dup.name, 100 - length(' (' || n || ')')) || ' (' || n || ')';
      exit when not exists (
        select 1 from library_member_types
        where tenant_id = dup.tenant_id and deleted_at is null and id <> dup.id
          and lower(btrim(name)) = lower(candidate)
      );
      n := n + 1;
    end loop;
    update library_member_types set name = candidate, updated_at = now() where id = dup.id;
  end loop;
end
$$;

create unique index ux_library_member_types_name on library_member_types (tenant_id, lower(btrim(name)))
  where deleted_at is null;
