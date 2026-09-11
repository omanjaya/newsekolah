-- The old app logged the caller's ip alongside method/path for every
-- request made under impersonation (reference/sion-rebuild-go
-- impersonation.go); the new schema dropped it. Nullable because rows
-- inserted before this migration have none.
alter table impersonation_actions add column ip inet;
