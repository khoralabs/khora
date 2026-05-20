# Valkey for Khora Labs homepage waitlist

Redis-compatible KV for invite waitlist deduplication and email→token mapping. Used by `apps/khoralabs/homepage` via `Bun.redis` (`RedisClient`).

## Build

Use the **repository root** as the build context (same as `apps/s3`):

```sh
docker build -t khora-waitlist-redis -f apps/redis/Dockerfile .
```

## Run (local / Docker)

```sh
docker run -d --name khora-waitlist-redis \
  -p 6379:6379 \
  -v khora-waitlist-redis-data:/data \
  khora-waitlist-redis
```

```sh
REDIS_URL=redis://localhost:6379
```

## Render

**Do not deploy this image as a public Web Service.** Render’s HTTP health checks send `POST` / `Host:` to the bound port. Valkey speaks the Redis protocol only and will log:

`Possible SECURITY ATTACK detected... POST or Host: commands to Redis`

Use one of:

1. **Render Private Service** — no public URL; homepage `REDIS_URL` uses the [internal hostname](https://render.com/docs/private-services) (e.g. `redis://<service>:6379`).
2. **Managed Redis** — e.g. [Upstash](https://upstash.com), Render Key Value, or another host; set `REDIS_URL` on the homepage service.
3. **Local Docker only** — for dev; production uses managed/private Redis.

The homepage must be a **Web Service** on `$PORT` (HTTP). Redis must be reachable only over the Redis protocol, not exposed as an HTTP target.

## Homepage

Point `REDIS_URL` at Valkey from `apps/khoralabs/homepage/.env` (see `.env.example` there).
