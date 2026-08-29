import { createClient } from "@libsql/client";
import { LibsqlDialect } from "@libsql/kysely-libsql";
import { Kysely } from "kysely";
import type { RegistryAuthDatabaseSchema, RegistryAuthKysely } from "./auth-database-schema";

export function createRegistryLibsqlAuthDatabase(opts: {
  url: string;
  authToken?: string;
}): RegistryAuthKysely {
  const client = createClient({ url: opts.url, authToken: opts.authToken });
  return new Kysely<RegistryAuthDatabaseSchema>({
    dialect: new LibsqlDialect({ client: client as never }),
  });
}
