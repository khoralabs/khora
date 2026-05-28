import type { Database } from "bun:sqlite";
import type { KhoraHostHealthPort } from "@khoralabs/khora-host";

export function createKhoraHostHealthPort(
  catalogDb: Database,
  framesDb: Database,
): KhoraHostHealthPort {
  return {
    ping() {
      catalogDb.query("SELECT 1").run();
      framesDb.query("SELECT 1").run();
    },
  };
}
