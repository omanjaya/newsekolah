-- Data fix for duties left behind by deleting a class: until the academic
-- DeleteClass started ending them, soft-deleting a class left its homeroom
-- duty (and any other duty scoped to it) active. The duties list showed it
-- as a homeroom role with no class, and the holder could not be named
-- homeroom teacher of another class that year (409
-- TEACHER_ALREADY_HOMEROOM), pointing at a class nobody could see.
--
-- Each such duty ends on the day its class was deleted, in the tenant's
-- local calendar (the same conversion the service uses for these dates),
-- or on its own first day when it starts later.
update duty_assignments da
set is_active = false,
    ends_on = coalesce(da.ends_on, greatest(da.starts_on, (c.deleted_at at time zone t.timezone)::date))
from classes c
join tenants t on t.id = c.tenant_id
where c.id = da.scope_class_id
  and c.deleted_at is not null
  and da.is_active;
