# @khoralabs/bun-web

Convention and tooling for Bun fullstack apps (HTML imports + `Bun.serve`).

## Rules

1. **HTML imports only in `routes`** — never return an HTMLBundle from `fetch`.
2. **Dev:** `bun --hot src/index.ts` with `development: { hmr: true }` and direct `import page from "./….html"`.
3. **Production:** `bun-web build` then `NODE_ENV=production bun dist/index.js` — build bundles the **server entry** (`target: bun`) so HTML becomes prebuilt manifests (no runtime bundling).

## Setup

Add `web-ui.config.ts` at the app root:

```ts
import { defineWebUi } from "@khoralabs/bun-web";

export default defineWebUi({
  serverEntry: "./src/index.ts",
  outdir: "dist",
  mounts: [
    {
      name: "admin",
      html: "./src/routes/admin/index.html",
      routes: ["/admin", "/admin/", "/admin/hosts", "/admin/hosts/*"],
    },
  ],
  check: { forbid: [/bun:sqlite/] },
});
```

In the server:

```ts
import { buildRoutesFromMounts } from "@khoralabs/bun-web";
import adminPage from "./routes/admin/index.html";
import webUi from "../web-ui.config";

const htmlRoutes = buildRoutesFromMounts(webUi.mounts, { admin: adminPage });

Bun.serve({
  routes: { ...htmlRoutes },
  async fetch(req) { /* APIs only */ },
  development: process.env.NODE_ENV !== "production" && { hmr: true, console: true },
});
```

`package.json`:

```json
{
  "scripts": {
    "build:web": "bun-web build",
    "prestart": "bun run build:web",
    "start": "NODE_ENV=production sh -c 'cd dist && exec bun index.js'"
  }
}
```

Production must run with **`cwd` = `dist/`** (e.g. `cd dist && bun index.js`) so the embedded HTML manifest resolves `./chunk-*.js` next to `dist/index.js`. Do **not** run `bun dist/index.js` from the app root. Apps with native deps (e.g. `sqlite-vec`) use `packages: "external"` (default) so `node_modules` remains at the app root (`dist/../node_modules`).

Embedded servers with data dirs should resolve paths from `import.meta.dir` (parent = app root), not `process.cwd()`, when using `cd dist`.

`bunfig.toml`:

```toml
[serve.static]
plugins = ["bun-plugin-tailwind"]
```

## CLI

- `bun-web build` — production server bundle + optional `check.forbid` scan
- `bun-web check` — scan only
