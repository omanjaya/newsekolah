-- Restores table-wide code uniqueness. Fails if a deleted type and a live
-- one now share a code, which only the up migration's partial index allows.
-- The types restored as inactive by the up migration stay restored: there
-- is no record of which ones they were.
drop index ux_violation_types_tenant_code_live;
alter table violation_types add constraint violation_types_tenant_id_code_key unique (tenant_id, code);
