/** IdP ceremony persistence — not part of open federation contracts. */

export type DeviceAuthorizationStatus = "pending" | "approved" | "consumed" | "expired";

export type AgentAuthRegistrationStatus = "pending_claim" | "claimed" | "expired";

export type DeviceAuthorization = {
  id: string;
  deviceCodeHash: string;
  userCode: string;
  status: DeviceAuthorizationStatus;
  sessionToken: string | null;
  expiresAtMs: number;
  approvedAtMs: number | null;
  consumedAtMs: number | null;
  sourceApp: string | null;
  createdAtMs: number;
};

export type AgentAuthRegistration = {
  id: string;
  email: string;
  claimTokenHash: string;
  otpHash: string | null;
  expiresAtMs: number;
  status: AgentAuthRegistrationStatus;
  createdAtMs: number;
};
