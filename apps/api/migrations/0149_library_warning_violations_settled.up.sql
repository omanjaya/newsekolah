-- Data fix for late-return warnings stored as unpaid. The service has
-- always meant a warning (currency fines off, no suspension) to be
-- recorded already settled, but CreateViolation did not write the status,
-- so the column default stored every warning as 'unpaid'. The member page
-- then showed "unpaid fine Rp 0" and clearance (bebas pustaka) stayed
-- blocked until a librarian waived the warning by hand.
--
-- A warning leaves nothing to pay or serve, so each one still unpaid is
-- marked waived, settled by its author when it was recorded, as new
-- warnings now are.
update library_violations
set status = 'waived',
    settled_at = created_at,
    settled_by = created_by
where penalty = 'warning'
  and status = 'unpaid';
