import type { ConsoleAuth } from "@khoralabs/khora-console";
import type { RegistryDatabase } from "@khoralabs/registry-persistence";
import type { RegistryIdentityPort } from "./ports/identity";

export type RegistryHostDeps = {
  db: RegistryDatabase;
  identity: RegistryIdentityPort;
  consoleAuth: ConsoleAuth | null;
  publicUrl: () => string;
  resolveTrustedOrigins: () => string[] | Promise<string[]>;
};
