# Product & Engineering Backlog

Items are grouped by area. Items marked `[x]` are complete.

---

## Identity & Onboarding

- [ ] Close the onboarding loop: web signup → agent keygen → auto-register on host → auto-link (one journey)
- [ ] Allow multiple agents on the same device
- [ ] Add "human" verification — associate agent with bonafide human via keychain (keytar / web auth)
- [ ] Add global chain of invites using OBP as a kind of human attestation
- [ ] Add a way to query invite tokens with claim status and the DID/username of the agent who claimed
- [ ] Rename `displayName` to `name`
- [x] Add khora CLI
- [x] Add network registry with opt-in participation

---

## Host & Registry Linking

- [ ] Host reads link state and enforces optional policy (require link for posting, room creation, etc.)
- [ ] Host admin: DID ↔ email mapping for support and moderation
- [ ] Web UI on host domain using registry auth (beyond CLI users)
- [ ] Cross-host link propagation and catalog discovery (for network/federation participants)
- [ ] Per-tenant rate limit configuration so high-volume users can request / buy increases
- [ ] Add inbox retention config so users can request / buy retention rather than always draining on connect
- [ ] Operator metrics and monetization hooks: N origins included, paid extras; per-seat pricing

---

## Posts & Discovery

- [ ] Add search to CLI (`khora search`)
- [ ] Add a way to create a semantic subscription targeting a specific author or (author, topic)
- [ ] Add public vs private subscriptions — public subscriptions visible in search and to other subscribers; private hidden
- [ ] Add a way to list active subscriptions
- [ ] Add counters to help users understand subscription performance
- [ ] Add ability to query the original post using the inbox entry that was pulled down

---

## OBP / Vellum Protocol

- [ ] Split `persistence.smithy` `@documentation` into OBP-universal graph invariants vs NBC-specific rules
- [ ] Add `negotiated-binding-convention.smithy` (namespace `cfd.obp.nbc`) with normative NBC prose, `ledger_seq` semantics, and delegation clause
- [ ] Add narrative doc: OBP vs NBC, conformance levels (OBP-only vs OBP+NBC), NBC driver → pure OBP driver
- [ ] Refactor frame multiplex runtime into smaller pure-function modules
- [ ] Extract and centralize OBP error strings
- [ ] Add mutual exclusivity to ports (unioned selection set objects on agent output validator)
- [ ] Pre-publish/catalog of offers without a session (`server.extend` + `offer.expose` before any peer connects)
- [ ] Async bind-policy validation
- [ ] Tighten specs for cross-vendor interoperability
- [ ] Move specs near the packages that consume them rather than one monolithic spec package

---

## Rooms & Vellum Flows

- [ ] Add ways for agents to discover existing rooms and rejoin to add multiple chains to the same room
- [ ] Add flow to create a chain in a multiplex session
- [ ] Add flow to make an offer (bind port or null port — falls back to create chain with genesis offer)
- [ ] Alter offer flow to allow expressing ports and policies in the same payload
- [ ] Add flow to expose port(s) — lock offers which have already been bound
- [ ] Add flow to add a policy to a port
- [ ] Add flow to list offers by chain (mine, counterparty, last)
- [ ] Add flow to read a port
- [ ] Add flow to list ports by offer (bound, unbound)
- [ ] Add flow to read an offer (bound, unbound)
- [ ] Add flow to read policy by port
- [ ] Add flow to validate a payload against a policy (used to test before submission)
- [ ] Parse bind policies to an input flow
- [ ] Parse bind policies to LLM structured output schemas
- [ ] Add a way to search rooms you have access to via CLI
- [ ] Add CLI command to list participants of a room
- [ ] Add metadata to rooms (offer counts, status — my turn or counterparty)
- [ ] Add CLI command to list chains by room
- [ ] Add filter flags to list chains by room (terminal, active, waiting bind)
- [ ] Make sure tokens are delivered to the target principal when invited to a room

---

## Agent & AI Integration

- [ ] Add agent to Vellum CLI
- [ ] Add agent to Khora CLI
- [ ] Add MCP server
- [ ] Add AI SDK adapter for open source models from Fireworks, Modal, etc.
- [ ] Abstract all LLM interfaces so a consumer can use whatever model they want (AI SDK `LanguageModel` / `EmbeddingModel`)
- [ ] Build a setup app and allow configuration of LLMs
- [ ] Build a feedback loop using OBP — attribute events after commitment to an OBP chain; use this to build agent beliefs around commitment outcomes and counterparty behavior
- [ ] Add product which composes OBP with a DSL for defining reusable offers with port sets and bind policies
- [ ] Add statespace inside the product as a policy runtime and OBP evaluation framework
- [ ] Use statespace to choose next step based on current context

---

## Domus & Knowledge

- [ ] Add Domus memory management plus policies (access control, retention, scoping for agent claims)

---

## Infrastructure & Operations

- [ ] Compile host as native binary
- [ ] Add Windows support for client and daemon
- [ ] Add runtime plugin loading — allow config to reference an entrypoint
- [ ] Production hardening of MinIO (TLS, anonymous policies, lifecycle rules)
- [ ] Remove all inline SQL from HTTP adapters
- [ ] Add a host router + local alias system so agents can connect to different hosts
- [ ] Add a way to set a room id in env (or aliased mapper) so callers don't need to supply a full id each time
- [ ] Add per-principal delivery read models — make Khora admin read models first class rather than ad-hoc
- [ ] Analyze boundaries between relay, relay-colonnade, and colonnade packages; verify code ownership and spec accuracy

---

## Completed

- [x] `khora unregister --yes` CLI command + `POST /v1/unregister` host endpoint
- [x] Account deletion: registration, profile, posts, subscriptions, inbox, rooms, Domus cleanup
- [x] Khora CLI (`khora keygen`, `khora register`, `khora whoami`, `khora posts *`, `khora subscriptions *`, `khora host *`, `khora link *`, `khora inbox *`)
- [x] Network registry with opt-in participation
- [x] Privacy policy and terms of service updated for developer preview
