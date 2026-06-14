# Repository Layout

```
exedra/
├── src/
│   ├── index.ts              # Bun.serve() entry point
│   ├── server/               # API routes, WebSocket handlers, background jobs
│   │   ├── auth/             # GET /api/auth/session (registry verify)
│   │   ├── invites/          # Deep-link invite metadata + accept
│   │   └── routes.ts         # Route table wired in src/index.ts
│   ├── agents/               # Interview, synthesis, alignment agent logic
│   │   ├── interview.ts      # Interview agent (Vercel AI SDK streamText)
│   │   ├── synthesis.ts      # Synthesis agent (transcript → memories)
│   │   └── alignment.ts      # Alignment agent (@mention handler, resolution commits)
│   ├── db/                   # SQLite schema, migrations, query helpers
│   │   ├── schema.ts         # Table definitions (threads, messages, sessions, etc.)
│   │   └── queries/          # Typed query helpers per domain
│   └── client/               # React pages + components (browser bundle)
│       ├── components/auth/  # SignIn, InviteGate (EmailConfirm + registry OTP)
│       ├── lib/              # registry-url, registry-email-confirm-api, auth-session
│       └── components/ui/    # shadcn primitives
├── package.json
├── tsconfig.json
├── bunfig.toml               # Tailwind plugin, BUN_PUBLIC_* vars
└── .brain/product/exedra/    # Product spec (keep in sync with implementation)
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

## Dependencies

- `@khoralabs/registry-auth` + `@khoralabs/registry-accounts-react` — OTP auth (homepage pattern)
- `@khoralabs/memories-*` — knowledge graph (via khora monorepo workspaces)
- `input-otp` — OTP input UI
