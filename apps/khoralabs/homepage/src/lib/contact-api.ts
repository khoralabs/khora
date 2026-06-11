import { cancelContact, confirmContact, enqueueContact } from "./contact-queue";
import { logger } from "./logger";

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const EMAIL_MAX = 254;
const MESSAGE_MAX = 4000;

type Bucket = { count: number; windowStartMs: number };
const buckets = new Map<string, Bucket>();

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded !== null && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return "unknown";
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (bucket === undefined || now - bucket.windowStartMs >= RATE_WINDOW_MS) {
    buckets.set(ip, { count: 1, windowStartMs: now });
    return true;
  }
  if (bucket.count >= RATE_LIMIT) return false;
  bucket.count += 1;
  return true;
}

function parseQueueBody(
  body: unknown,
): { email: string; message: string; marketingConsent: boolean } | null {
  if (typeof body !== "object" || body === null) return null;

  const email =
    "email" in body && typeof (body as { email: unknown }).email === "string"
      ? (body as { email: string }).email.trim()
      : "";
  const message =
    "message" in body && typeof (body as { message: unknown }).message === "string"
      ? (body as { message: string }).message.trim()
      : "";
  const marketingConsent =
    "marketingConsent" in body &&
    typeof (body as { marketingConsent: unknown }).marketingConsent === "boolean"
      ? (body as { marketingConsent: boolean }).marketingConsent
      : false;

  if (email.length === 0 || !email.includes("@") || email.length > EMAIL_MAX) return null;
  if (message.length === 0 || message.length > MESSAGE_MAX) return null;

  return { email, message, marketingConsent };
}

function slackErrorResponse(result: { ok: false; error: string }): Response {
  if (result.error === "not_configured") {
    logger.error({ event: "contact.slack_not_configured" }, "contact_slack_failed");
    return new Response(null, { status: 503 });
  }
  return new Response(null, { status: 502 });
}

export async function handleContactQueue(req: Request): Promise<Response> {
  const ip = clientIp(req);
  if (!checkRateLimit(ip)) {
    return new Response(null, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  const parsed = parseQueueBody(body);
  if (parsed === null) {
    return new Response(null, { status: 400 });
  }

  const id = enqueueContact(parsed);
  return Response.json({ id });
}

export async function handleContactConfirm(req: Request): Promise<Response> {
  const ip = clientIp(req);
  if (!checkRateLimit(ip)) {
    return new Response(null, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  const id =
    typeof body === "object" &&
    body !== null &&
    "id" in body &&
    typeof (body as { id: unknown }).id === "string"
      ? (body as { id: string }).id.trim()
      : "";

  if (id.length === 0) {
    return new Response(null, { status: 400 });
  }

  const result = await confirmContact(id);
  if (!result.ok) {
    return slackErrorResponse(result);
  }

  return new Response(null, { status: 204 });
}

export function handleContactCancel(_req: Request, id: string): Response {
  if (id.trim().length === 0) {
    return new Response(null, { status: 400 });
  }

  cancelContact(id.trim());
  return new Response(null, { status: 204 });
}
