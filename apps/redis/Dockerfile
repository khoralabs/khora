# Valkey (Redis-compatible) for homepage waitlist KV (see apps/redis/README.md).
# AOF persistence enabled; data under /data.
FROM valkey/valkey:8.0.2-alpine

COPY apps/redis/valkey.conf /usr/local/etc/valkey/valkey.conf

EXPOSE 6379

VOLUME ["/data"]

CMD ["valkey-server", "/usr/local/etc/valkey/valkey.conf"]
