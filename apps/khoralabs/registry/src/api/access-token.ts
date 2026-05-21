import { queueAccessTokenWorkflow } from "../workflows/access-token";

export async function handleAccessTokenRequest(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: true });
  }

  const email =
    typeof body === "object" &&
    body !== null &&
    "email" in body &&
    typeof (body as { email: unknown }).email === "string"
      ? (body as { email: string }).email.trim().toLowerCase()
      : "";
  if (email.length === 0 || !email.includes("@")) {
    return Response.json({ ok: true });
  }

  const hostSlug =
    typeof body === "object" &&
    body !== null &&
    "hostSlug" in body &&
    typeof (body as { hostSlug: unknown }).hostSlug === "string"
      ? (body as { hostSlug: string }).hostSlug
      : undefined;
  const sourceApp =
    typeof body === "object" &&
    body !== null &&
    "sourceApp" in body &&
    typeof (body as { sourceApp: unknown }).sourceApp === "string"
      ? (body as { sourceApp: string }).sourceApp
      : undefined;

  try {
    queueAccessTokenWorkflow({ email, hostSlug, sourceApp });
  } catch (err: unknown) {
    console.error("[registry] access-token request failed:", err);
  }

  return Response.json({ ok: true });
}
