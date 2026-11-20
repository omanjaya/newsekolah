drop index if exists ix_announcements_notify_pending;
alter table announcements drop column if exists notified_at;
