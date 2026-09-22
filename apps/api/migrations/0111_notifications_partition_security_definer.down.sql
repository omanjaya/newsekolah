alter function ensure_notifications_partition(date) reset search_path;
alter function ensure_notifications_partition(date) security invoker;
