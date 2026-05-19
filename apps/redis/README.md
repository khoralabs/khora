# Valkey for Khora Labs homepage waitlist

Redis-compatible KV for invite waitlist deduplication and email→token mapping. Used by `apps/khoralabs/homepage` via `Bun.redis` (`RedisClient`).

## Build

Use the **repository root** as the build context (same as `apps/s3`):

```sh
docker build -t khora-waitlist-redis -f apps/redis/Dockerfile .
```

## Run

```sh
docker run -d --name khora-waitlist-redis \
  -p 6379:6379 \
  -e REDIS_PASSWORD=change-me \
  -v khora-waitlist-redis-data:/data \
  khora-waitlist-redis
```

With a password, set on the homepage server:

```sh
REDIS_URL=redis://:change-me@localhost:6379
```

Without `REDIS_PASSWORD`, use `REDIS_URL=redis://localhost:6379` and ensure `valkey.conf` does not require auth (default image config).

## Homepage

Point `REDIS_URL` at this container from `apps/khoralabs/homepage/.env` (see `.env.example` there).
