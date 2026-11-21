-- A warning leaves the member nothing to pay or serve, so it is stored
-- already settled. Until now that settled status was 'waived', which the
-- violations list reads as "Dibebaskan" (let off) and files under the
-- waived filter, as if the warning had been revoked. A warning that was
-- given was not let off: it is settled as done, the 'paid' status a
-- suspension marked served takes, which reads "Selesai" and sits under
-- the settled filter. New warnings are stored that way
-- (domain.InitialViolationStatus); this moves the ones already stored.
--
-- Staff never waive a warning by hand (it is never unpaid, so it has no
-- settle action), so every waived warning is one recorded settled.
-- settled_at and settled_by are kept as they are.
update library_violations
set status = 'paid'
where penalty = 'warning'
  and status = 'waived';
