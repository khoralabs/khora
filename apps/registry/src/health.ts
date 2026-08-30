import { getRegistrySqliteDatabase } from "@khoralabs/registry/sqlite";

export function handleHealth(): Response {
  return Response.json({ ok: true });
}

export function handleReady(): Response {
  const issues: string[] = [];

  try {
    getRegistrySqliteDatabase().query("SELECT 1").run();
  } catch {
    issues.push("db");
  }

  if ((process.env.REGISTRY_SQLCIPHER_KEY?.trim() ?? "").length === 0) {
    issues.push("REGISTRY_SQLCIPHER_KEY");
  }

  if ((process.env.BETTER_AUTH_SECRET?.trim() ?? "").length < 32) {
    issues.push("BETTER_AUTH_SECRET");
  }

  const otpLogOnly = process.env.REGISTRY_AUTH_OTP_LOG?.trim() === "1";
  if (!otpLogOnly && (process.env.SES_FROM_ADDRESS?.trim() ?? "").length === 0) {
    issues.push("SES_FROM_ADDRESS");
  }

  if (issues.length > 0) {
    return Response.json({ ok: false, issues }, { status: 503 });
  }
  return Response.json({ ok: true });
}
