alter table duty_assignments drop constraint if exists fk_duty_assignments_scope_class;
alter table duty_assignments drop constraint if exists fk_duty_assignments_academic_year;
alter table user_roles drop constraint if exists fk_user_roles_academic_year;

drop table if exists teaching_assignments;
drop table if exists school_days;
drop table if exists period_day_assignments;
drop table if exists periods;
drop table if exists period_templates;
drop table if exists subject_offerings;
drop table if exists subjects;
drop table if exists enrollments;
drop table if exists classes;
drop table if exists rooms;
drop table if exists tracks;
drop table if exists grade_levels;
drop table if exists academic_calendar_events;
drop table if exists terms;
drop table if exists academic_years;
