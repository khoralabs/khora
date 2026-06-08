import type { Database } from "bun:sqlite";
import type { ConsoleAuth } from "@khoralabs/khora-console";
import type { RegistryIdentityPort } from "./ports/identity";

export type RegistryHostDeps = {
  db: Database;
  identity: RegistryIdentityPort;
  consoleAuth: ConsoleAuth | null;
  publicUrl: () => string;
  resolveTrustedOrigins: () => string[];
};
