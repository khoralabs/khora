# Khora admin

CSR operator console for a headless `@khoralabs/khora-server`. Serves `/admin` HTML and proxies `/admin/api/*` to the host so session cookies stay same-origin.

```bash
# with headless server on :8788
bun run --cwd apps/khora/admin dev
# → http://127.0.0.1:8789/admin
```

See `.env.example` for `PORT` and `KHORA_HOST_ORIGIN`.
