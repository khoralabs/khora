/** Extract the most recent OTP from registry log text (stdout/stderr). */
export function scrapeLatestOtp(logText: string): string | undefined {
  let latest: string | undefined;
  for (const match of logText.matchAll(/OTP dev log \(REGISTRY_AUTH_OTP_LOG\):\s*(\d+)/g)) {
    latest = match[1];
  }
  return latest;
}

/** Poll until an OTP appears in `getLog`, or throw. */
export async function waitForOtp(
  getLog: () => string,
  opts?: { timeoutMs?: number; pollMs?: number },
): Promise<string> {
  const timeoutMs = opts?.timeoutMs ?? 15_000;
  const pollMs = opts?.pollMs ?? 100;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const otp = scrapeLatestOtp(getLog());
    if (otp !== undefined) return otp;
    await Bun.sleep(pollMs);
  }
  throw new Error(`timed out waiting for OTP in registry logs\n---\n${getLog().slice(-4000)}`);
}
