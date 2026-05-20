import { inviteWorkflow } from "./invite-workflow.ts";

/**
 * POST /api/invite — waitlist invite minting
 *
 * Accepts { email } and starts a durable workflow. The workflow is
 * fire-and-forget from the client's perspective: the response returns
 * immediately; token minting and delivery run in the background.
 *
 * Stores:
 *   - Email KV  : Valkey/Redis (disk-backed, AOF) via Bun.redis
 *   - Pipeline  : inviteWorkflow() runs in-process (Workflow SDK `start()` needs Nitro)
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
 *   B->>W: inviteWorkflow(email)
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
export async function handleInviteRequest(req: Request): Promise<Response> {
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

  void inviteWorkflow(email).catch((err: unknown) => {
    console.error("[invite] workflow failed:", err);
  });

  return Response.json({ ok: true }, { status: 200 });
}
