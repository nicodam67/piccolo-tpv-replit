FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates openssl python3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/piccolo
COPY app/ /opt/piccolo/app/
COPY docker/entrypoint.sh /opt/piccolo/entrypoint.sh
RUN chmod +x /opt/piccolo/entrypoint.sh \
  && useradd --system --home-dir /var/lib/piccolo --shell /usr/sbin/nologin piccolo \
  && mkdir -p /var/lib/piccolo/{config,secrets,logs,uploads,backups,caddy} \
  && chown -R piccolo:piccolo /opt/piccolo /var/lib/piccolo

ENV PICCOLO_APP_ROOT=/opt/piccolo/app
ENV PICCOLO_DATA_ROOT=/var/lib/piccolo
ENV NODE_ENV=production

USER piccolo
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
  CMD curl -fsS http://127.0.0.1:${PORT:-8080}/api/healthz || exit 1

ENTRYPOINT ["/opt/piccolo/entrypoint.sh"]
