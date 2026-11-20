-- Documented no-op: the up migration ended duties that were still active on
-- deleted classes. Turning them back on would restore duties for classes
-- that no longer exist, the exact inconsistency it fixes. Nothing to undo.
select 1;
