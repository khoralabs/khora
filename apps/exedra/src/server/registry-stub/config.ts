export function isExedraStubRegistryEnabled(): boolean {
  const value = process.env.EXEDRA_STUB_REGISTRY?.trim().toLowerCase();
  return value === "1" || value === "true";
}

/** Fixed OTP for local stub sign-in (no SES). Override with EXEDRA_STUB_REGISTRY_OTP. */
export function getStubRegistryOtp(): string {
  const fromEnv = process.env.EXEDRA_STUB_REGISTRY_OTP?.trim();
  return fromEnv !== undefined && fromEnv.length > 0 ? fromEnv : "000000";
}

/** Base URL for the in-process stub (Exedra itself — not the external registry). */
export function getStubRegistryPublicUrl(): string {
  const fromEnv = process.env.EXEDRA_PUBLIC_URL?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return fromEnv.replace(/\/$/, "");
  }
  const port = process.env.PORT?.trim() || "3000";
  return `http://localhost:${port}`;
}
