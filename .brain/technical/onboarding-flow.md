# Signup and Invite Flow

The marketing "waitlist" is copy only. The registry models **verified users** (accounts + emails), not a waitlist queue. Hosts mint and consume invite tokens locally; the operator bridges the two.

---

## Sequence

```
User → Homepage: Click "Join waitlist"
Homepage → Registry: OTP signup (/join)
Registry → User: Verified account (+ optional marketing consent)

Operator → Registry: Email lookup in /admin
Operator → Host: Mint invite token (/admin Operations)
Operator → User: Deliver token out of band

User → Host: Register agent with invite token (POST /v1/register)
User → Registry: Link agent to account (khora link)
```

---

## Step by step

1. **User signs up** — Homepage `/join` runs registry Better Auth OTP. Side effect: verified registry account; optional `khora-waitlist` marketing consent via `POST /v1/marketing/subscribe`.

2. **Operator finds user** — Registry admin `/admin/lookup` by email.

3. **Operator mints invite** — Host admin Operations → `POST /admin/api/invites/mint`. Copy plaintext token once; registry never sees it.

4. **Operator delivers token** — Out of band (email, DM, etc.). No software automation between registry approval and host invite.

5. **User registers agent** — `khora register` → `POST /v1/register` on host with invite token (when `KHORA_INVITE_REQUIRED=1`). Ed25519 keypair must be generated first (`khora keygen`).

6. **User links agent** — `khora link` → `POST /v1/link/agent` attributes the agent DID to the registry account.

---

## Routes

| Surface | Route |
|---------|-------|
| Marketing join UI | `GET /join` on khoralabs homepage |
| Registry auth | `POST /api/auth/*` (Better Auth OTP) |
| Marketing consent | `POST /v1/marketing/subscribe` |
| Registry admin | `/admin/lookup` |
| Host admin mint | `POST /admin/api/invites/mint` |
| Host admin claims | `GET /admin/api/invites` |
| Agent registration | `POST /v1/register` |
| Agent attribution | `POST /v1/link/agent` |

---

## Prerequisites by service

| Service | Must be configured |
|---------|-------------------|
| Registry | `BETTER_AUTH_SECRET`, `SES_FROM_ADDRESS`, homepage origin in trusted origins |
| khoralabs homepage | `BUN_PUBLIC_KHORA_REGISTRY_URL` (build-time) |
| khora-server | `KHORA_INVITE_PEPPER`, `KHORA_CONSOLE_ROOT_TOKEN`, optionally `KHORA_INVITE_REQUIRED` |

Registry does **not** store invite plaintext or hashes. The invite pepper never leaves the host.

---

## The gap: onboarding friction

The current flow requires three distinct manual steps (keygen → register → link) with no automated handoff between homepage signup and agent registration. The ideal state is a single journey: web signup → agent keygen → auto-register on host → auto-link.

See `product/registry.md` for the priority analysis on closing this loop.
