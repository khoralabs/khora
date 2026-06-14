# Repository Layout

```
exedra/
├── src/
│   ├── index.ts              # Bun.serve() entry point
│   ├── server/               # API routes, WebSocket handlers, background jobs
│   │   ├── routes/           # HTTP route handlers (/api/*)
│   │   ├── ws/               # WebSocket upgrade + message handlers
│   │   └── jobs/             # Background job runner + job definitions
│   ├── agents/               # Interview, synthesis, alignment agent logic
│   │   ├── interview.ts      # Interview agent (Vercel AI SDK streamText)
│   │   ├── synthesis.ts      # Synthesis agent (transcript → memories)
│   │   └── alignment.ts      # Alignment agent (@mention handler, resolution commits)
│   ├── db/                   # SQLite schema, migrations, query helpers
│   │   ├── schema.ts         # Table definitions (threads, messages, sessions, etc.)
│   │   └── queries/          # Typed query helpers per domain
│   └── client/               # React pages + components (browser bundle)
│       ├── routes/           # Per-page index.html + client.tsx pairs
│       └── components/       # Shared UI components
├── package.json
├── tsconfig.json
├── bunfig.toml               # Tailwind plugin, BUN_PUBLIC_* vars
└── .spec/                    # This spec
```

## Entry Point (`src/index.ts`)

```typescript
import { serve } from "bun";

serve({
  routes: {
    // API
    "/api/sessions/:id":      { GET, POST, PATCH },
    "/api/teams/:id":         { GET, POST },
    "/api/invites/:token":    { GET, POST },
    "/api/jobs/:id":          { GET },

    // WebSocket (interview + alignment chat)
    "/ws": {
      GET: (req, server) => server.upgrade(req) ? undefined : new Response("upgrade required", { status: 426 })
    },

    // Internal SSR shells (served by Bun bundler)
    "/__ssr-shell/*": shellRoutes,

    // All other paths → SSR React app
    "/*": ssrRoute,
  },
  websocket: {
    open(ws) { /* ... */ },
    message(ws, data) { /* route by ws.data.kind: "interview" | "alignment" */ },
    close(ws) { /* cleanup */ },
  },
  development: process.env.NODE_ENV !== "production" && { hmr: true, console: true },
});
```

## Scripts

| Command | What it does |
|---|---|
| `bun run dev` | `bun --hot src/index.ts` — hot reload dev server |
| `bun run start` | `NODE_ENV=production bun src/index.ts` |

## Key Dependencies (already in package.json)

- `react` + `react-dom` 19 — SSR + hydration
- `tailwindcss` + `bun-plugin-tailwind` — CSS
- `@radix-ui/*` — accessible UI primitives

## Vendor / Submodule

`vendor/memories/` is a git submodule pointing to `git@github.com:khoralabs/memories.git`.

All memories packages are declared as Bun workspaces in `package.json` so they're importable as `@khoralabs/memories-*` without publishing:

```json
"workspaces": [
  "vendor/memories/packages/core",
  "vendor/memories/packages/ontologies",
  "vendor/memories/packages/persistence/sqlite",
  "vendor/memories/packages/agents/integrator",
  ...
]
```

To update memories to latest: `git submodule update --remote vendor/memories`

## Dependencies to Add

- `ai` — Vercel AI SDK
- `@ai-sdk/openai` — OpenAI provider
- `@khoralabs/memories-core` + `@khoralabs/memories-sqlite`
- `@khoralabs/registry-auth` + `@khoralabs/registry-accounts`
- `@khoralabs/sourcemaps`
