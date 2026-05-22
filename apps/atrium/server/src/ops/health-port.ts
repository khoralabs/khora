import type { Database } from "bun:sqlite";
import type { AtriumHostHealthPort } from "@khoralabs/atrium-host";

export function createAtriumHostHealthPort(
  catalogDb: Database,
  framesDb: Database,
): AtriumHostHealthPort {
  return {
    ping() {
      catalogDb.query("SELECT 1").run();
      framesDb.query("SELECT 1").run();
    },
  };
}
