# Message & Thread Storage

## Tables in `exedra.db`

### `threads`

Generic thread container. Can represent an interview session or an alignment group chat.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | Stable thread ID |
| `kind` | TEXT | `"interview"` \| `"alignment"` |
| `session_id` | TEXT FK | Parent alignment session |
| `user_id` | TEXT | Owner/participant (interview) or null (group) |
| `created_at_ms` | INTEGER | Unix ms |
| `closed_at_ms` | INTEGER | Null until thread closes |

### `messages`

Stores [Vercel AI SDK `UIMessage`](https://ai-sdk.dev/docs/reference/ai-sdk-core/ui-message) rows natively.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | AI SDK message id |
| `thread_id` | TEXT FK | Parent thread |
| `role` | TEXT | `"user"` \| `"assistant"` \| `"system"` |
| `parts` | BLOB (JSONB) | `UIMessagePart[]` via `jsonb(?)` |
| `metadata` | BLOB (JSONB) | Optional `UIMessage.metadata` |
| `message_index` | INTEGER | Position in thread (0-based, monotonic) |
| `created_at_ms` | INTEGER | Unix ms |

Load: `SELECT id, role, json(parts) AS parts, json(metadata) AS metadata, message_index FROM messages WHERE thread_id = ? ORDER BY message_index`.

Insert: bind `parts` (and optional `metadata`) with `jsonb(?)`.

---

## Belief Provenance via Sourcemaps

Belief flags surfaced by the interview agent carry a `ContentAddressedRef` pointing back to the source message using `@khoralabs/sourcemaps`.

### Locator type

```typescript
type MessageLocator = {
  domain: "exedra_message";
  entity_id: string;    // message.id
  thread_id: string;    // message.thread_id
  message_index: number;
};

type MessageRef = ContentAddressedRef<MessageLocator>;
```

Provenance uses message id + index; `parts` JSONB is the canonical body (tool parts include `flagBelief` invocations).

### Feedback loop

When a stakeholder confirms, corrects, or dismisses a belief flag, the outcome is recorded alongside the `MessageRef`:

```typescript
type BeliefFlagOutcome = {
  ref: MessageRef;
  outcome: "confirmed" | "corrected" | "dismissed";
  corrected_content?: string;
  created_at: number;
};
```
