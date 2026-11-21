-- Restores the earlier settled status of a warning, 'waived'. Every
-- warning is stored settled, so each one marked paid goes back.
update library_violations
set status = 'waived'
where penalty = 'warning'
  and status = 'paid';
