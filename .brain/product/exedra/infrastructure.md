# Infrastructure & Platform Strategy

## Khora Network Integration

The alignment app is a strategic opportunity to introduce the Khora network into business and team workflows.

### Delivery & Fan-out

- Session invites are **deep links** into Exedra (`/invite/{token}`), delivered by email or Khora inbox
- Invitee completes registry OTP on the invite page if not already signed in
- For participants with a DID, Khora network inbox can deliver the deep link URL

### Auth Planes

| Participant | Auth |
|---|---|
| Facilitator (internal team member) | Khora DID (`@khoralabs/khora-auth`) or registry OTP (`@khoralabs/registry-auth`) |
| Respondent (external stakeholder) | Registry OTP via invite deep link (`/invite/{token}`) |

### Reusable Packages

| Package | Role in alignment app |
|---|---|
| `@khoralabs/khora-auth` | Agent/facilitator identity and request signing |
| `@khoralabs/khora-client` | Post/subscribe/inbox for Khora-native delivery |
| `@khoralabs/khora-invites` | Gated invite token mint/consume |
| `@khoralabs/memories-core` + `memories-sqlite` | Knowledge base backend |
| `@khoralabs/registry-auth` | Human OTP auth for facilitator onboarding |

### Sovereign / Custodial Modes

- **Custodial:** Khora Labs hosts both memories and alignment sessions (default for new teams)
- **Self-hosted:** Company runs their own memories backend + alignment server; Khora network is optional
- **Local/sovereign:** Individual's personal memory namespace lives on their own device; only shared facts flow to the hosted team namespace

## Tech Stack

- **Repo:** `apps/exedra` in the khora monorepo
- **Runtime:** Bun
- **Backend:** `Bun.serve()` (TypeScript)
- **Frontend:** React + HTML imports via Bun bundler
- **Dependencies:** `@khoralabs/*` packages pulled from elsewhere in the workspace (memories, khora-auth, khora-client, registry-auth, etc.)
- **Database:** `bun:sqlite` (via `@khoralabs/memories-sqlite` for the knowledge base; app state in its own SQLite db)

## Delivery Channels

The core alignment product is a **web app**. Standard OAuth/HTTP for teams that don't want Khora infra. Khora network participation is opt-in and additive — it should not be a prerequisite.

Future delivery surface: Slack app or similar, where the alignment interview and group chat live inside existing team tools. The knowledge base integration remains the same regardless of surface.
