import type { Database } from "bun:sqlite";
import type { KhoraHostHealthPort } from "@khoralabs/khora-host";

export function createKhoraHostHealthPort(hostDb: Database): KhoraHostHealthPort {
  return {
    ping() {
      hostDb.query("SELECT 1").run();
    },
  };
}
