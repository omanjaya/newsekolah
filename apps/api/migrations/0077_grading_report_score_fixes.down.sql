alter table assessment_components drop constraint assessment_components_weight_check;
alter table assessment_components add constraint assessment_components_weight_check check (weight > 0);

alter table report_scores drop column automatic_score;
