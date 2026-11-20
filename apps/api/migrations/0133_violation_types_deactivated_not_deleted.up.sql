-- The violation catalog's "Nonaktifkan" action used to call DELETE, which
-- soft-deleted the type: it vanished even from "Tampilkan yang nonaktif",
-- could not be switched back on, and its code stayed taken for good. The
-- web now deactivates through the update endpoint instead. The catalog
-- never offered any other way to delete a type, so every soft-deleted type
-- was meant to be deactivated: bring them back as inactive types the admin
-- can see and switch on again.
update violation_types
set deleted_at = null, is_active = false
where deleted_at is not null;

-- A type removed through DELETE (API clients only) frees its code for a
-- new type: uniqueness now covers live rows only.
alter table violation_types drop constraint violation_types_tenant_id_code_key;
create unique index ux_violation_types_tenant_code_live on violation_types (tenant_id, code)
  where deleted_at is null;
