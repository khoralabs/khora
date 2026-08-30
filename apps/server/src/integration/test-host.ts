import path from "node:path";
import { createTestEncryptionMaterial } from "@khoralabs/colonnade/crypto";
import type { KhoraHostContext } from "@khoralabs/khora-host";
import { bootstrapKhoraHost } from "../bootstrap-khora";

export type CreateTestKhoraHostOpts = {
  hostDbPath: string;
  authNoncesDbPath?: string;
  percolatorDbPath?: string;
  cellsDir: string;
  useCellWorkers?: boolean;
  tenantKey?: string;
  startPrincipalTeardownWorker?: boolean;
};

/** Integration helper: same stack as production via {@link bootstrapKhoraHost}. */
export async function createTestKhoraHost(
  opts: CreateTestKhoraHostOpts,
): Promise<KhoraHostContext> {
  const encryption = createTestEncryptionMaterial();
  const dataDir = path.dirname(opts.hostDbPath);
  const { ctx } = await bootstrapKhoraHost({
    hostDbPath: opts.hostDbPath,
    authNoncesDbPath: opts.authNoncesDbPath ?? path.join(dataDir, "khora-auth-nonces.sqlite"),
    percolatorDbPath: opts.percolatorDbPath ?? path.join(dataDir, "khora-percolator.sqlite"),
    cellsDir: opts.cellsDir,
    useCellWorkers: opts.useCellWorkers ?? false,
    encryption: {
      sqlCipherKey: encryption.sqlCipherKey,
      outboxPayloadCodec: encryption.outboxPayloadCodec,
      outboxKeyHex: encryption.outboxKeyHex,
    },
    startPrincipalTeardownWorker: opts.startPrincipalTeardownWorker ?? false,
    ...(opts.tenantKey !== undefined ? { tenantKey: opts.tenantKey } : {}),
  });
  return ctx;
}
