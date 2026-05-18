import type { FlagMap } from "@khoralabs/cli-kit";
import { boolFlag } from "@khoralabs/cli-kit";
import { listLocalVellumRows } from "@khoralabs/vellum-client";

import { dataDirForEnv } from "../flows/context.ts";

export function handleList(flags: FlagMap): void {
  const dataDir = dataDirForEnv(flags);
  const rows = listLocalVellumRows({ dataDir });
  if (boolFlag(flags, "json")) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  if (rows.length === 0) {
    console.log("(no local rooms under data dir)");
    return;
  }
  console.log("roomId\tpid\tcontrolPort\tstatus");
  for (const r of rows) {
    const pidCol = r.pid !== undefined ? String(r.pid) : "-";
    const portCol = r.controlPort !== undefined ? String(r.controlPort) : "-";
    console.log(`${r.roomId}\t${pidCol}\t${portCol}\t${r.status}`);
  }
}
