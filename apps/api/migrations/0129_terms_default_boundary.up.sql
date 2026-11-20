-- Before this change domain.BuildDefaultTerms started each generated term
-- on the very day the previous one ended, so every year created with
-- default terms has a one-day overlap at each boundary. The term service
-- now refuses terms that share a day (domain.ValidateTermPlacement), which
-- would make every such year's terms impossible to edit without first
-- moving the boundary by hand. Repair exactly that shape: a term that
-- starts on the day an earlier-starting term of the same year ends moves its start
-- one day later, as long as it stays at least two days long (the
-- ends_on > starts_on check). Terms only ever compare by is_active, never
-- by date, so shifting a boundary day changes nothing else.
--
-- Any other overlap (a term an admin placed across two others, say) is
-- left as it is: there is no safe automatic fix for it, and the service
-- reports it as ACADEMIC_TERM_OVERLAP the next time one of those terms is
-- saved. That is also why there is no exclusion constraint here: adding
-- one fails on such data and would stop the API from booting. The service
-- serialises term writes per year with a row lock instead
-- (Service.checkTermPlacement).
update terms t
set starts_on = t.starts_on + 1
where t.starts_on + 1 < t.ends_on
  and exists (
    select 1
    from terms p
    where p.academic_year_id = t.academic_year_id
      and p.id <> t.id
      and p.starts_on < t.starts_on
      and p.ends_on = t.starts_on
  );
