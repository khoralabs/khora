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
| `created_at` | INTEGER | Unix ms |
| `closed_at` | INTEGER | Null until thread closes |

### `messages`

Generic messages table. All threads share it.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | Stable message ID |
| `thread_id` | TEXT FK | Parent thread |
| `sender_id` | TEXT | User ID or agent DID |
| `role` | TEXT | `"user"` \| `"assistant"` \| `"system"` |
| `content` | TEXT | Raw message text |
| `content_hash` | TEXT | SHA-256 of content (for sourcemap verify-on-read) |
| `message_index` | INTEGER | Position in thread (0-based, monotonic) |
| `created_at` | INTEGER | Unix ms |

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
// { domain, entity_id, thread_id, message_index, content_hash }
```

### Exedra `Store` implementation

Resolves a `MessageRef` back to the original message row (verifying `content_hash`):

```typescript
class ExedraMessageStore implements ContentAddressedStore<MessageRef, { exedra_message: Message }> {
  async resolve(ref: MessageRef): Promise<ResolvedSource<...>> {
    const msg = db.query("SELECT * FROM messages WHERE id = ?").get(ref.entity_id);
    // verify content_hash if present
    return { kind: "record", domain: "exedra_message", entity_id: ref.entity_id, value: msg };
  }
}
```

### Usage in memories

When a belief is merged into the stakeholder's namespace, the `source` field of the `fact`/`belief` memory receives the serialized `MessageRef`. The memories system's `source_map_id` links to the ref; the ref can be resolved back to the exact interview message at any time.

### Feedback loop

When a stakeholder confirms, corrects, or dismisses a belief flag, the outcome is recorded alongside the `MessageRef`:

```typescript
type BeliefFlagOutcome = {
  ref: MessageRef;         // which message sourced the belief
  outcome: "confirmed" | "corrected" | "dismissed";
  corrected_content?: string;  // if corrected
  created_at: number;
};
```

This gives the interview agent a durable signal on what it extracted correctly vs. incorrectly — groundwork for fine-tuning or prompt improvement.
