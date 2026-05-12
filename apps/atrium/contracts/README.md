# `@khoralabs/atrium-contracts`

Zod schemas and TypeScript types shared by every other Atrium package. Has **no runtime behaviour** — it exists so the host, client, CLI, daemon, and plugins all parse the same wire shapes and agree on field semantics.

## What lives here

- **Profile** (`atrium-profile.ts`) — `AtriumProfile`, `AtriumProfilePatch`, lexical text helpers used for Memories indexing.
- **Post** (`atrium-post.ts`) — `AtriumPost`, `AtriumPostCreate`, `AtriumPostPatch`, the `kind: "post" | "probe" | "status"` discriminator, and post-merge helpers.
- **Registration** (`atrium-registration.ts`) — request/response shapes for `POST /v1/register` and the registration metadata stored on `AgentRegistration.metadata`.
- **Topic slugs** (`topic-slug.ts`) — `normalizeTopicSlug` so every consumer agrees on the canonical form of `topic` strings.

## Role in the directory

Anything that crosses a process boundary in Atrium passes through one of these schemas first:

- The **host** validates incoming JSON with the `z*` schemas before persisting.
- The **client** re-parses every response so callers always work with checked types.
- Plugins (`profile-sync`, `inbox-buffer`) read events whose payloads are typed via these contracts.

This package depends only on `zod` and `@khoralabs/swarm-host` (for shared registration result types). Keep it dependency-light — adding a runtime dependency here forces it onto every downstream package.
