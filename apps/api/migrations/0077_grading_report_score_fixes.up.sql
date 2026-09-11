-- Grading regression fixes (docs/06-database-schema.md section 9).
--
-- automatic_score keeps the freshly recomputed value separate from
-- final_score, so a manual override can be cleared and restore the
-- automatic value without a full recompute (SetManualReportScore).
alter table report_scores add column automatic_score numeric(6,2);
update report_scores set automatic_score = final_score where automatic_score is null;
alter table report_scores alter column automatic_score set not null;

-- The old app allowed a component weight of exactly 0 (grading.go:168's
-- "0 sampai 100"); the rebuild's check constraint required weight > 0.
alter table assessment_components drop constraint assessment_components_weight_check;
alter table assessment_components add constraint assessment_components_weight_check check (weight >= 0);
