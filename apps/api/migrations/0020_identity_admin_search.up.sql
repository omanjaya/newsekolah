-- Supports the admin user list's search-by-name/username/NIS/NIP and its
-- status/profile-kind filters (docs/analysis/backend-inventory.md section
-- 1.5). Tables themselves already exist from 0002_identity; this only adds
-- the indexes that search and filter needed but 0002 did not.
create extension if not exists pg_trgm;

create index ix_users_name_trgm on users using gin (name gin_trgm_ops);
create index ix_users_username_trgm on users using gin (username gin_trgm_ops);
create index ix_student_profiles_nis_trgm on student_profiles using gin (nis gin_trgm_ops);
create index ix_teacher_profiles_nip_trgm on teacher_profiles using gin (nip gin_trgm_ops);

create index ix_users_tenant_status on users (tenant_id, status);
create index ix_user_profiles_tenant_kind on user_profiles (tenant_id, kind);
