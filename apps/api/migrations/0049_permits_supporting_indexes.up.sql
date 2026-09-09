-- late_arrivals.occurrence_number ("2nd and 5th -> call_parent, 3rd and
-- 6th -> send_home", docs/analysis/backend-inventory.md 1.16) is computed
-- from a per-student, per-academic-year count of prior late_arrival
-- instances; this index makes that count and the "does the student have
-- an in-progress late arrival today" check (permits.AttendanceBlocker)
-- index-only.
create index ix_workflow_instances_subject_year on workflow_instances (tenant_id, kind, subject_user_id, academic_year_id);
