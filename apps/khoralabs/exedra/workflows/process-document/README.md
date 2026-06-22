# Process Document Workflow

Render Workflow that parses, embeds, and integrates session documents into user personal memory.

## Architecture

- **Exedra app** dispatches `processDocument` tasks fire-and-forget on turn start when a message includes document attachments
- **Interview agent** reads document bytes directly from S3 at turn time (does not wait on this workflow)
- **This workflow** fetches bytes via Exedra internal API, embeds chunks, merges into user scope via `/internal/memories/merge-document-chunk`, then marks the document `ready`

## Local development

Set on Exedra (`apps/khoralabs/exedra/app/.env`):

```
EXEDRA_INTERNAL_TOKEN=dev-internal-token
RENDER_API_KEY=...
RENDER_DOCUMENT_WORKFLOW_SLUG=process-document
```

Set on this workflow:

```
EXEDRA_INTERNAL_URL=http://localhost:3000
EXEDRA_INTERNAL_TOKEN=dev-internal-token
GOOGLE_GENERATIVE_AI_API_KEY=...
```

Start workflow: `render workflows dev -- bun src/main.ts`

If `RENDER_DOCUMENT_WORKFLOW_SLUG` is not set, document processing is skipped (chat still works).
