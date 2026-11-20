-- Terms of one academic year must not share a calendar day. The service
-- checks this first (domain.ValidateTermPlacement, a clear
-- ACADEMIC_TERM_OVERLAP); this exclusion constraint is the backstop for two
-- saves at the same moment, which the service check alone would miss. Both
-- ends are inclusive ('[]'), the way the admin reads "13 Jul - 20 Des".
--
-- Data fix first: before this change domain.BuildDefaultTerms started each
-- generated term on the very day the previous one ended, so every year
-- created with default terms has a one-day overlap at each boundary. Move
-- such a term's start to the day after the latest end among the year's
-- earlier terms, as long as that still leaves it at least two days long
-- (the ends_on > starts_on check). Terms only ever compare by is_active,
-- never by date, so shifting a boundary day changes nothing else.
update terms t
set starts_on = prev.max_end + 1
from (
  select t2.id, max(p.ends_on) as max_end
  from terms t2
  join terms p
    on p.academic_year_id = t2.academic_year_id
   and p.sequence < t2.sequence
  group by t2.id
) prev
where prev.id = t.id
  and prev.max_end >= t.starts_on
  and prev.max_end + 1 < t.ends_on;

alter table terms
  add constraint ex_terms_no_overlap
  exclude using gist (
    academic_year_id with =,
    daterange(starts_on, ends_on, '[]') with &&
  );
