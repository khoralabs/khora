import { AtriumClient } from "@khoralabs/atrium-client";
import type { FlagMap } from "@khoralabs/cli-kit";
import { boolFlag } from "@khoralabs/cli-kit";
import { listLocalVellumRows } from "@khoralabs/vellum-client";

import { cliBaseUrl, dataDirForEnv, loadSigner } from "../flows/context.ts";

function localConnectedLabel(
  roomId: string,
  locals: ReturnType<typeof listLocalVellumRows>,
): string {
  const local = locals.find((r) => r.roomId === roomId);
  if (local === undefined) return "-";
  return local.status === "running" ? "running" : "stale";
}

export async function handleList(flags: FlagMap): Promise<void> {
  const dataDir = dataDirForEnv(flags);
  const locals = listLocalVellumRows({ dataDir });

  const signer = await loadSigner(flags);
  const ac = new AtriumClient({ baseUrl: cliBaseUrl(flags), signer });
  try {
    const { relationships } = await ac.listRelationships();
    const rows = relationships.map((r) => ({
      ...r,
      connected: localConnectedLabel(r.roomId, locals),
    }));
    if (boolFlag(flags, "json")) {
      console.log(JSON.stringify(rows, null, 2));
      return;
    }
    if (rows.length === 0) {
      console.log("(no rooms)");
      return;
    }
    console.log("roomId\trole\tpeerDid\tconnected\texpiresAtMs");
    for (const r of rows) {
      const peer = r.peerDid ?? "-";
      const exp = r.expiresAtMs !== undefined ? String(r.expiresAtMs) : "-";
      console.log(`${r.roomId}\t${r.role}\t${peer}\t${r.connected}\t${exp}`);
    }
  } finally {
    ac.dispose();
  }
}
