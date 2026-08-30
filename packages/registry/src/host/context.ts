import type { RegistryDatabase } from "@khoralabs/khora-registry/persistence";
import type { RegistryIdentityPort } from "./ports/identity";

export type RegistryHostContext = {
  db: RegistryDatabase;
  identity: RegistryIdentityPort;
  fetch(req: Request): Promise<Response>;
  stop(): void;
};
