# auth.md

You are an agent. This document describes how to register a human on the Khora registry and link a local agent identity — without a browser.

Discovery starts at [khoralabs.com](https://khoralabs.com):

```http
GET /
GET /?format=json
GET /.well-known/khoralabs.json
```

The index route returns the same discovery JSON when `Accept: application/json` or `?format=json`.
That document includes this file, the CLI skill URL, command reference URL, install script, and registry auth metadata URLs.

## Supported flow (v1)

**User-claimed, email-required only** — matches the homepage `/join` experience. There is no anonymous or pre-claim access.

| Step | Action |
|------|--------|
| 1 | Fetch `/.well-known/khoralabs.json` and install the CLI skill |
| 2 | Ask the human for their email |
| 3 | `POST /agent/auth` on the registry with `verified_email` |
| 4 | Human reads the OTP from email and gives it to you |
| 5 | `POST /agent/auth/claim/complete` with `claim_token` + OTP → registry session |
| 6 | `khora link --email=… --otp=…` (or separate register + complete calls) → DID binding |

## Registry metadata

Fetch protected resource metadata:

```http
GET {registryUrl}/.well-known/oauth-protected-resource
```

Fetch authorization server metadata (includes `agent_auth`):

```http
GET {registryUrl}/.well-known/oauth-authorization-server
```

## Register (send OTP)

```http
POST /agent/auth
Content-Type: application/json

{
  "type": "identity_assertion",
  "assertion_type": "verified_email",
  "email": "user@example.com"
}
```

Response:

```json
{
  "registration_id": "…",
  "claim_token": "…",
  "status": "pending_claim"
}
```

Hold `claim_token` in memory for the claim step. An OTP email is sent to the user.

## Complete claim (session credential)

```http
POST /agent/auth/claim/complete
Content-Type: application/json

{
  "claim_token": "…",
  "otp": "123456"
}
```

You may also pass `"email"` instead of `"claim_token"` when completing a pending registration from a second CLI invocation.

Response:

```json
{
  "status": "claimed",
  "credential": {
    "type": "session",
    "session_cookie": "better-auth.session_token=…"
  }
}
```

The registry also sets `Set-Cookie` for browser compatibility. The CLI persists `session_cookie` for subsequent `/v1/link/*` calls.

## Link agent DID

After you have a registry session, bind the local agent key:

```bash
khora link --email=user@example.com --otp=123456
```

Or run `khora link` without email flags for the browser device flow.

Linking uses:

- `GET /v1/link/challenge?did=…`
- signed `POST /v1/link/agent`

## Scopes

| Scope | Purpose |
|-------|---------|
| `registry.session` | Registry account session (Better Auth cookie) |
| `link.agent` | Associate an agent DID with the account on a host |

## Host registration

Host discovery is separate from registry auth:

```http
GET {hostBaseUrl}/.well-known/khora
```

Use `khora host list`, `khora host use <slug>`, and `khora register` after identity setup.

## Links

- Skill: [khora-cli/SKILL.md](https://github.com/khoralabs/skills/blob/main/khora-cli/SKILL.md)
- Commands: [khora-cli/references/commands.md](https://github.com/khoralabs/skills/blob/main/khora-cli/references/commands.md)
- Privacy: `/privacy`
- Terms: `/terms`
- Homepage join UI: `/join`
