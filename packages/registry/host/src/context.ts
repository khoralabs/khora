import type { Database } from "bun:sqlite";
import type { RegistryIdentityPort } from "./ports/identity";

export type RegistryHostContext = {
  db: Database;
  identity: RegistryIdentityPort;
  fetch(req: Request): Promise<Response>;
  stop(): void;
};
