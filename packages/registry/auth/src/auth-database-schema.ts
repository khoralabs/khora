import type { Kysely } from "kysely";

/** Better Auth `user` table (includes registry `role` additional field). */
export type BetterAuthUserTable = {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  image: string | null;
  createdAt: Date | string | number;
  updatedAt: Date | string | number;
  role: string;
};

export type BetterAuthSessionTable = {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date | string | number;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date | string | number;
  updatedAt: Date | string | number;
};

export type BetterAuthAccountTable = {
  id: string;
  userId: string;
  accountId: string;
  providerId: string;
  accessToken: string | null;
  refreshToken: string | null;
  idToken: string | null;
  accessTokenExpiresAt: Date | string | number | null;
  refreshTokenExpiresAt: Date | string | number | null;
  scope: string | null;
  password: string | null;
  createdAt: Date | string | number;
  updatedAt: Date | string | number;
};

export type BetterAuthVerificationTable = {
  id: string;
  identifier: string;
  value: string;
  expiresAt: Date | string | number;
  createdAt: Date | string | number;
  updatedAt: Date | string | number;
};

/** Kysely view of Better Auth tables stored in the registry auth database. */
export interface RegistryAuthDatabaseSchema {
  user: BetterAuthUserTable;
  session: BetterAuthSessionTable;
  account: BetterAuthAccountTable;
  verification: BetterAuthVerificationTable;
}

export type RegistryAuthKysely = Kysely<RegistryAuthDatabaseSchema>;
