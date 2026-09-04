import z from "zod";

/** Stable machine-readable codes for host JSON error envelopes. */
export const KHORA_ERROR_CODE = {
  rate_limited: "rate_limited",
  registration_failed: "registration_failed",
  invite_invalid: "invite_invalid",
  username_taken: "username_taken",
  population_full: "population_full",
  already_registered: "already_registered",
  registration_forbidden: "registration_forbidden",
  not_registered: "not_registered",
  not_found: "not_found",
  forbidden: "forbidden",
  unauthorized: "unauthorized",
  invalid_request: "invalid_request",
  search_disabled: "search_disabled",
  invites_not_configured: "invites_not_configured",
  admin_auth_not_configured: "admin_auth_not_configured",
  upgrade_unsupported: "upgrade_unsupported",
  internal_error: "internal_error",
  bad_gateway: "bad_gateway",
  conflict: "conflict",
} as const;

export type KhoraErrorCode = (typeof KHORA_ERROR_CODE)[keyof typeof KHORA_ERROR_CODE];

export const zKhoraErrorCode = z.enum([
  KHORA_ERROR_CODE.rate_limited,
  KHORA_ERROR_CODE.registration_failed,
  KHORA_ERROR_CODE.invite_invalid,
  KHORA_ERROR_CODE.username_taken,
  KHORA_ERROR_CODE.population_full,
  KHORA_ERROR_CODE.already_registered,
  KHORA_ERROR_CODE.registration_forbidden,
  KHORA_ERROR_CODE.not_registered,
  KHORA_ERROR_CODE.not_found,
  KHORA_ERROR_CODE.forbidden,
  KHORA_ERROR_CODE.unauthorized,
  KHORA_ERROR_CODE.invalid_request,
  KHORA_ERROR_CODE.search_disabled,
  KHORA_ERROR_CODE.invites_not_configured,
  KHORA_ERROR_CODE.admin_auth_not_configured,
  KHORA_ERROR_CODE.upgrade_unsupported,
  KHORA_ERROR_CODE.internal_error,
  KHORA_ERROR_CODE.bad_gateway,
  KHORA_ERROR_CODE.conflict,
]);

export const zKhoraErrorEnvelope = z.object({
  error: z.string(),
  code: zKhoraErrorCode.optional(),
});

export type KhoraErrorEnvelope = z.infer<typeof zKhoraErrorEnvelope>;
