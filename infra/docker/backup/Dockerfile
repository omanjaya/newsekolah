# Optional backup sidecar: runs infra/scripts/backup.sh on a cron schedule.
# Build context is the repo root (see docker-compose.prod.yml) so the script
# stays a single source of truth shared with manual/CLI use.
FROM alpine:3.20

RUN apk add --no-cache \
        bash \
        postgresql16-client \
        dcron \
        curl \
        tzdata \
        age \
        gzip \
    && curl -fsSL -o /usr/local/bin/mc \
        https://dl.min.io/client/mc/release/linux-amd64/mc \
    && chmod +x /usr/local/bin/mc

COPY infra/scripts/backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh

# Cron schedule is baked in at container start (entrypoint), not at build
# time, so BACKUP_CRON_SCHEDULE from .env takes effect without a rebuild.
COPY infra/docker/backup/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
