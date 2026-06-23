# @khoralabs/chat-core

Use-case-agnostic chat contracts and service layer.

## Concepts

- **Scope** — identity that authors posts, joins channels, and participates in threads
- **Channel** — container for top-level threads and membership
- **Thread** — access-controlled message ledger rooted in a channel or post
- **Post** — AI SDK `UIMessage` plus ledger metadata (author, hashes, mentions, index)
- **PostVersion** — immutable version of a post payload for edit history and branching
- **ThreadHead** — named pointer to a post version (default head drives linear UI)

## Exports

- Domain types: `Scope`, `Channel`, `Thread`, `Post`, `PostVersion`, `ChatAclEvent`, …
- Persistence port: `ChatPersistence`, `AppendPostInput`, …
- Hash helpers: `computeContentHash`, `computeLineageHash`, canonical serialization
- Lineage helpers: `walkLineageFromHead`, `lineageBetween`, `postFromVersion`
- Service: `createChatService(persistence, options?)`
- Errors and events

## Example

```ts
import { createChatService } from "@khoralabs/chat-core";
import { createMemoryChatPersistence } from "@khoralabs/chat-persistence";

const service = createChatService(createMemoryChatPersistence());
const channel = await service.createChannel({});
const thread = await service.createThread({
  root: { type: "channel", channelId: channel.id },
});
await service.appendPost({
  threadId: thread.id,
  author: { type: "account", id: "user-1" },
  message: { id: "m1", role: "user", parts: [{ type: "text", text: "hello" }] },
});
```

Posts follow the AI SDK message shape. Tool, reasoning, file, and custom parts round-trip without interpretation.

## Versioning

Threads behave like append-only commit logs:

- `contentHash` — canonical hash of version payload
- `lineageHash` — incremental hash over thread history
- Edits create new `PostVersion` rows linked by `parentVersionId`
- Appends chain through `previousPostVersionId`
- Alternate views use named `ThreadHead` refs

## Signing

`SignedEnvelope`, `ChatSigner`, and `ChatVerifier` support DID-backed signatures on post versions and ACL events. Signing is optional at runtime but modeled in persistence from day one.
