# Optional backup sidecar: runs infra/scripts/backup.sh on a cron schedule.
# Build context is the repo root (see docker-compose.prod.yml) so the script
# stays a single source of truth shared with manual/CLI use.
#
# The mc binary is copied out of docker.io/pgsty/mc rather than downloaded
# from dl.min.io/client/mc/release/... : MinIO Inc archived the open-source
# MinIO Server/Client on 2026-09-24, and that download URL now returns 410
# Gone. pgsty/mc is the community-maintained continuation of the mc client
# (same CLI); see the minio service in docker-compose.prod.yml for the
# matching server image.
FROM docker.io/pgsty/mc:RELEASE.2026-09-16T00-00-00Z AS mc

FROM alpine:3.20

RUN apk add --no-cache \
        bash \
        postgresql16-client \
        dcron \
        curl \
        tzdata \
        age \
        gzip

COPY --from=mc /usr/bin/mc /usr/local/bin/mc

COPY infra/scripts/backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh

# Cron schedule is baked in at container start (entrypoint), not at build
# time, so BACKUP_CRON_SCHEDULE from .env takes effect without a rebuild.
COPY infra/docker/backup/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
