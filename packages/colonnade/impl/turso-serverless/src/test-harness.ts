import { createTursoClients } from "./client";
import { createTursoColonnadeCluster } from "./cluster";

export function hasTursoIntegrationEnv(): boolean {
  const url = process.env.TURSO_DATABASE_URL?.trim();
  const token = process.env.TURSO_AUTH_TOKEN?.trim();
  return Boolean(url && token);
}

export function requireTursoIntegrationEnv(): { url: string; authToken: string } {
  const url = process.env.TURSO_DATABASE_URL?.trim();
  const token = process.env.TURSO_AUTH_TOKEN?.trim();
  if (!url || !token) {
    throw new Error(
      "Turso integration tests require TURSO_DATABASE_URL and TURSO_AUTH_TOKEN environment variables",
    );
  }
  return { url, authToken: token };
}

/** URL template for integration tests: append cell id suffix to base URL host. */
export function tursoTestUrlTemplate(baseUrl: string): string {
  const u = new URL(baseUrl.replace(/^libsql:\/\//, "https://"));
  const host = u.hostname.replace(/\.turso\.io$/, "");
  return `libsql://${host}-{shardIndex}.${u.hostname.includes("turso") ? "turso.io" : u.host}`;
}

export async function openTursoTestCluster(opts: {
  cellCount: number;
  outboxPayloadCodec: import("@khoralabs/colonnade-crypto").OutboxPayloadCodec;
}) {
  const { url, authToken } = requireTursoIntegrationEnv();
  return createTursoColonnadeCluster({
    cells: { urlTemplate: url, authToken },
    catalogShards: { urlTemplate: url, authToken, shardCount: 1 },
    mode: { kind: "pool", cellCount: opts.cellCount },
    encryption: { outboxPayloadCodec: opts.outboxPayloadCodec },
  });
}

export async function probeTursoDb(url: string, authToken: string): Promise<boolean> {
  const db = createTursoClients({ url, authToken });
  try {
    await db.read.execute("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await db.read.close();
    await db.write.close();
  }
}
