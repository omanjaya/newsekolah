-- Regression fix: late-arrival review must be restricted to the teacher
-- whose token opened the flow (see docs/analysis/backend-inventory.md
-- 1.16), which needs a real column to check against instead of the opaque
-- "opened_by_token_of" string permits was only keeping in
-- workflow_instances.payload.
alter table late_arrivals
  add column duty_teacher_user_id uuid references users (id) on delete set null;

create index ix_late_arrivals_duty_teacher on late_arrivals (tenant_id, duty_teacher_user_id);

-- Missing rule: a document template can carry a letterhead image (tenant
-- branding asset), rendered above the body on the default leave-letter
-- template -- the old app's separate leave.letter_header WebP upload,
-- reimplemented here as a pointer at an existing assets row rather than a
-- second upload path.
alter table document_templates
  add column letterhead_asset_id uuid references assets (id) on delete set null;
