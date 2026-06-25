import { getDb } from "../db/index.js";
import { getDocumentsS3Bucket } from "../documents/config.js";
import { getAiApiKey } from "../env.js";
import { resolveGeminiApiKey } from "../memories/embedding.js";

type HealthCheck = {
  ok: boolean;
  message?: string;
};

function envPresent(name: string): HealthCheck {
  const value = process.env[name]?.trim();
  return value !== undefined && value.length > 0
    ? { ok: true }
    : { ok: false, message: `${name} is not set` };
}

function checkDb(): HealthCheck {
  try {
    getDb().query("SELECT 1 AS ok").get();
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "database check failed",
    };
  }
}

export function buildReadinessChecks(): Record<string, HealthCheck> {
  return {
    db: checkDb(),
    invitePepper: envPresent("INVITE_PEPPER"),
    identityKey: envPresent("EXEDRA_IDENTITY_KEY"),
    knowledgeServiceUrl: envPresent("EXEDRA_KNOWLEDGE_SERVICE_URL"),
    aiApiKey:
      getAiApiKey() !== undefined ? { ok: true } : { ok: false, message: "AI_API_KEY is not set" },
    geminiApiKey:
      resolveGeminiApiKey() !== undefined
        ? { ok: true }
        : { ok: false, message: "Gemini API key is not set" },
    documentsS3Bucket:
      getDocumentsS3Bucket() !== undefined
        ? { ok: true }
        : { ok: false, message: "EXEDRA_DOCUMENTS_S3_BUCKET is not set" },
  };
}

export function handleHealth(): Response {
  return Response.json({ ok: true });
}

export function handleReady(): Response {
  const checks = buildReadinessChecks();
  const ok = Object.values(checks).every((check) => check.ok);
  return Response.json({ ok, checks }, { status: ok ? 200 : 503 });
}
