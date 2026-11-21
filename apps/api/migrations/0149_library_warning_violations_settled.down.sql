-- Documented no-op: the up migration settled warnings that were stored as
-- unpaid by mistake. Turning them back to unpaid would restore the "unpaid
-- fine Rp 0" rows and the blocked clearance it fixes. Nothing to undo.
select 1;
