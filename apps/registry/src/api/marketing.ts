import { subscribeMarketing, unsubscribeMarketing } from "@khoralabs/registry/accounts";
import { getRegistryDomainDatabase } from "@khoralabs/registry/auth";

export async function handleMarketingSubscribe(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email =
    typeof body === "object" &&
    body !== null &&
    "email" in body &&
    typeof (body as { email: unknown }).email === "string"
      ? (body as { email: string }).email.trim().toLowerCase()
      : "";
  const listSlug =
    typeof body === "object" &&
    body !== null &&
    "listSlug" in body &&
    typeof (body as { listSlug: unknown }).listSlug === "string"
      ? (body as { listSlug: string }).listSlug.trim()
      : "";
  const sourceApp =
    typeof body === "object" &&
    body !== null &&
    "sourceApp" in body &&
    typeof (body as { sourceApp: unknown }).sourceApp === "string"
      ? (body as { sourceApp: string }).sourceApp
      : undefined;

  if (email.length === 0 || !email.includes("@") || listSlug.length === 0) {
    return Response.json({ error: "email and listSlug are required" }, { status: 400 });
  }

  const consent = await subscribeMarketing(getRegistryDomainDatabase(), {
    email,
    listSlug,
    sourceApp,
  });
  return Response.json({ ok: true, consent });
}

export async function handleMarketingUnsubscribe(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email =
    typeof body === "object" &&
    body !== null &&
    "email" in body &&
    typeof (body as { email: unknown }).email === "string"
      ? (body as { email: string }).email.trim().toLowerCase()
      : "";
  const listSlug =
    typeof body === "object" &&
    body !== null &&
    "listSlug" in body &&
    typeof (body as { listSlug: unknown }).listSlug === "string"
      ? (body as { listSlug: string }).listSlug.trim()
      : "";

  if (email.length === 0 || listSlug.length === 0) {
    return Response.json({ error: "email and listSlug are required" }, { status: 400 });
  }

  const consent = await unsubscribeMarketing(getRegistryDomainDatabase(), { email, listSlug });
  return Response.json({ ok: true, consent });
}
