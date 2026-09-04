import { AuthError } from "@khoralabs/khora-auth";
import { KHORA_ERROR_CODE, type KhoraErrorCode } from "@khoralabs/khora-contracts/http";

function defaultErrorCode(status: number): KhoraErrorCode {
  if (status === 401) return KHORA_ERROR_CODE.unauthorized;
  if (status === 403) return KHORA_ERROR_CODE.forbidden;
  if (status === 404) return KHORA_ERROR_CODE.not_found;
  if (status === 409) return KHORA_ERROR_CODE.conflict;
  if (status === 429) return KHORA_ERROR_CODE.rate_limited;
  if (status === 502) return KHORA_ERROR_CODE.bad_gateway;
  if (status >= 500) return KHORA_ERROR_CODE.internal_error;
  if (status >= 400) return KHORA_ERROR_CODE.invalid_request;
  return KHORA_ERROR_CODE.internal_error;
}

export function jsonError(message: string, status: number, code?: KhoraErrorCode): Response {
  return Response.json({ error: message, code: code ?? defaultErrorCode(status) }, { status });
}

export function rateLimitedResponse(retryAfterSec: number): Response {
  return Response.json(
    { error: "Too many requests", code: KHORA_ERROR_CODE.rate_limited },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSec) },
    },
  );
}

export function authErrorResponse(e: unknown): Response {
  if (e instanceof AuthError) {
    return Response.json(
      { error: e.message, code: KHORA_ERROR_CODE.unauthorized },
      { status: e.status },
    );
  }
  const msg = e instanceof Error ? e.message : String(e);
  return jsonError(msg, 500, KHORA_ERROR_CODE.internal_error);
}

export function registrationOpaqueJson(status: number): Response {
  return Response.json(
    {
      error: "Registration could not be completed",
      code: KHORA_ERROR_CODE.registration_failed,
    },
    { status },
  );
}

export function inviteOpaqueNotFound(): Response {
  return Response.json(
    { error: "Invite could not be found", code: KHORA_ERROR_CODE.invite_invalid },
    { status: 404 },
  );
}
