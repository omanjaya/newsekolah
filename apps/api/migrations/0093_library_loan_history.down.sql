drop index if exists ix_library_titles_opac;
alter table library_copies drop column if exists is_opac;
alter table library_titles drop column if exists is_opac;
drop table if exists library_loan_renewals;
drop table if exists library_item_events;
alter table library_loans drop column if exists channel;
