import { serve } from "bun";
import { start } from "workflow/api";
import { inviteWorkflow } from "./api/invite-workflow.ts";
import blog from "./routes/blog/index.html";
import contact from "./routes/contact/index.html";
import index from "./routes/index.html";
import privacy from "./routes/privacy/index.html";
import terms from "./routes/terms/index.html";

/**
 * POST /api/invite — waitlist invite minting
 *
 * Accepts { email } and starts a durable workflow. The workflow is
 * fire-and-forget from the client's perspective: the response returns
 * immediately; token minting and delivery run in the background.
 *
 * Stores:
 *   - Email KV  : Valkey/Redis (disk-backed, AOF) via Bun.redis
 *   - Workflow  : Workflow SDK local world (.workflow-data/, filesystem)
 *
 * @sequence
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant B as Bun Server
 *   participant R as Redis (Valkey)
 *   participant W as Workflow SDK
 *   participant A as Atrium Server
 *   participant S as AWS SES
 *
 *   C->>B: POST /api/invite { email }
 *   B->>W: start(inviteWorkflow, [email])
 *   W->>R: SET email NX (step: storeEmail)
 *   alt duplicate
 *     R-->>W: null (key exists)
 *     W-->>B: return early
 *   else new
 *     R-->>W: OK
 *     B-->>C: 200 OK
 *     W->>A: POST /internal/mint-invite (step: mintInviteToken)
 *     A-->>W: { token }
 *     W->>R: SET email.token (step: updateToken)
 *     W->>S: SendEmailCommand (step: sendInviteEmail)
 *     S-->>W: MessageId
 *   end
 * ```
 */
async function handleInviteRequest(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: true }, { status: 200 });
  }
  const email =
    typeof body === "object" &&
    body !== null &&
    "email" in body &&
    typeof (body as { email: unknown }).email === "string"
      ? (body as { email: string }).email.trim().toLowerCase()
      : "";
  if (email.length === 0 || !email.includes("@")) {
    return Response.json({ ok: true }, { status: 200 });
  }

  void start(inviteWorkflow, [email]).catch((err: unknown) => {
    console.error("[invite] workflow failed:", err);
  });

  return Response.json({ ok: true }, { status: 200 });
}

const server = serve({
  routes: {
    "/api/invite": {
      POST: handleInviteRequest,
    },
    "/blog": blog,
    "/contact": contact,
    "/privacy": privacy,
    "/terms": terms,
    // Serve index.html for all unmatched routes.
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
