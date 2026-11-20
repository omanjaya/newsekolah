-- When an announcement's recipients were notified. Publishing a draft whose
-- "Tampil mulai" (starts_at) is still ahead used to notify everyone at
-- once, while the feed rightly hid the announcement until starts_at: the
-- notification opened on nothing. Such an announcement is now published
-- with notified_at null, and the announcements.publish_scheduled job
-- notifies its recipients once starts_at has passed.
alter table announcements add column notified_at timestamptz;

-- Every announcement already published or archived was notified when it
-- was published, so the job must not notify it again.
update announcements
set notified_at = coalesce(published_at, created_at)
where status in ('published', 'archived');

-- The job's scan: published, not yet notified.
create index ix_announcements_notify_pending
  on announcements (tenant_id, starts_at)
  where status = 'published' and notified_at is null and deleted_at is null;
