import { AuthError } from "@khoralabs/atrium-auth";

export function jsonError(msg: string, status: number): Response {
  return Response.json({ error: msg }, { status });
}

export function rateLimitedResponse(retryAfterSec: number): Response {
  return Response.json(
    { error: "Too many requests", code: "rate_limited" },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSec) },
    },
  );
}

export function authErrorResponse(e: unknown): Response {
  if (e instanceof AuthError) return jsonError(e.message, e.status);
  return jsonError(e instanceof Error ? e.message : String(e), 401);
}

export function registrationOpaqueJson(status: number): Response {
  return Response.json(
    { error: "Registration could not be completed", code: "registration_failed" },
    { status },
  );
}

export function inviteOpaqueNotFound(): Response {
  return Response.json(
    { error: "Invite could not be found", code: "invite_invalid" },
    { status: 404 },
  );
}
