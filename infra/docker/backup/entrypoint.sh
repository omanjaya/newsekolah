#!/usr/bin/env bash
# Writes the crontab from BACKUP_CRON_SCHEDULE and starts crond in the
# foreground. BusyBox crond runs each job with a near-empty environment, so
# the job sources a dumped copy of this container's env before running the
# backup script.
set -euo pipefail

schedule="${BACKUP_CRON_SCHEDULE:-0 2 * * *}"

printenv | sed -E "s/^([A-Za-z_][A-Za-z0-9_]*)=(.*)\$/export \1='\2'/" \
    > /etc/cron.d/env

echo "$schedule . /etc/cron.d/env; /usr/local/bin/backup.sh >> /proc/1/fd/1 2>> /proc/1/fd/2" \
    > /etc/crontabs/root

exec crond -f -l 2
