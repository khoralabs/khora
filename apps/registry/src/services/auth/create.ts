import type { Database } from "bun:sqlite";
import { createLogger } from "@khoralabs/observability/logger";
import { findBlockedEmail, linkBetterAuthUser } from "@khoralabs/registry/accounts";
import type { RegistryDatabase } from "@khoralabs/registry/persistence";
import { getRegistrySqliteBundle, getRegistrySqliteDatabase } from "@khoralabs/registry/sqlite";
import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import { sendOtpEmail } from "./email/ses";
import { isBootstrapStaffEmail, normalizeEmail } from "./staff";

const logger = createLogger({ name: "registry-auth" });

export type RegistryAuthDatabase = Database;

export type RegistryAuthOptions = {
  baseURL?: string;
  database?: RegistryAuthDatabase;
  domainDatabase?: RegistryDatabase;
  /** Returns all browser origins allowed to call /api/auth (registry + trusted host origins). */
  resolveTrustedOrigins?: () => string[] | Promise<string[]>;
};

function readRegistryPort(): string {
  return process.env.PORT?.trim() ?? "4000";
}

/** Parent-domain cookies when REGISTRY_COOKIE_DOMAIN is unset (e.g. parent `khoralabs.com` → cookie domain `.khoralabs.com`). */
function resolveRegistryCookieDomain(
  baseURL: string,
  explicitCookieDomain: string | undefined,
  parentDomain: string | undefined,
): string | undefined {
  const fromEnv = explicitCookieDomain?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv;

  const parent = parentDomain?.trim().replace(/^\./, "");
  if (parent === undefined || parent.length === 0) return undefined;

  try {
    const { hostname } = new URL(baseURL);
    if (hostname === parent || hostname.endsWith(`.${parent}`)) {
      return `.${parent}`;
    }
  } catch {
    /* ignore invalid baseURL */
  }
  return undefined;
}

function readAuthEnv(opts: RegistryAuthOptions = {}): {
  baseURL: string;
  secret: string;
  cookieDomain: string | undefined;
} {
  const port = readRegistryPort();
  const localOrigin = `http://localhost:${port}`;
  const configuredUrl =
    opts.baseURL?.trim()?.replace(/\/$/, "") ??
    process.env.REGISTRY_URL?.trim()?.replace(/\/$/, "") ??
    process.env.BETTER_AUTH_URL?.trim()?.replace(/\/$/, "");
  const baseURL = configuredUrl ?? localOrigin;

  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (secret === undefined || secret.length < 32) {
    throw new Error(
      "BETTER_AUTH_SECRET missing or too short (<32 chars). Set it in the registry app environment.",
    );
  }

  const cookieDomain = resolveRegistryCookieDomain(
    baseURL,
    process.env.REGISTRY_COOKIE_DOMAIN,
    process.env.REGISTRY_COOKIE_PARENT_DOMAIN,
  );
  return {
    baseURL,
    secret,
    cookieDomain,
  };
}

function shouldUseSecureCookies(baseURL: string): boolean {
  const explicit = process.env.KHORA_SECURE_COOKIES?.trim().toLowerCase();
  if (explicit === "1" || explicit === "true") return true;
  if (explicit === "0" || explicit === "false") return false;
  if (process.env.NODE_ENV === "production") return true;
  return baseURL.startsWith("https://");
}

function resolveAuthDatabase(opts: RegistryAuthOptions): RegistryAuthDatabase {
  return opts.database ?? getRegistrySqliteDatabase();
}

function resolveDomainDatabase(opts: RegistryAuthOptions): RegistryDatabase {
  return opts.domainDatabase ?? getRegistrySqliteBundle().registry;
}

function readAuthUserById(
  authDb: RegistryAuthDatabase,
  userId: string,
): { id: string; email: string } | undefined {
  return (
    (authDb.prepare(`SELECT id, email FROM user WHERE id = ? LIMIT 1`).get(userId) as {
      id: string;
      email: string;
    } | null) ?? undefined
  );
}

export function createRegistryAuth(opts: RegistryAuthOptions = {}) {
  const { baseURL, secret, cookieDomain } = readAuthEnv(opts);
  const port = readRegistryPort();
  const fallbackOrigins = [baseURL, `http://localhost:${port}`, `http://127.0.0.1:${port}`];
  const authDb = resolveAuthDatabase(opts);
  const domainDb = resolveDomainDatabase(opts);

  async function syncAccountForUser(userId: string, email: string): Promise<void> {
    await linkBetterAuthUser(domainDb, {
      providerSubject: userId,
      email,
    });
  }

  async function assertEmailAllowedForAuth(email: string): Promise<void> {
    const blocked = await findBlockedEmail(domainDb, email);
    if (blocked !== null) {
      throw new Error("email blocked");
    }
  }

  return betterAuth({
    database: authDb,
    baseURL,
    basePath: "/api/auth",
    secret,
    trustedOrigins: async () => {
      if (opts.resolveTrustedOrigins !== undefined) {
        return opts.resolveTrustedOrigins();
      }
      return fallbackOrigins;
    },
    advanced: {
      useSecureCookies: shouldUseSecureCookies(baseURL),
      ...(cookieDomain !== undefined
        ? {
            crossSubDomainCookies: {
              enabled: true,
              domain: cookieDomain,
            },
          }
        : {}),
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          defaultValue: "user",
          input: false,
        },
      },
    },
    plugins: [
      emailOTP({
        disableSignUp: false,
        expiresIn: 300,
        async sendVerificationOTP({ email, otp, type }) {
          if (type !== "sign-in") return;
          void sendOtpEmail({ email: normalizeEmail(email), otp }).catch((err: unknown) => {
            logger.error({ err }, "Failed to send OTP email");
          });
        },
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            await assertEmailAllowedForAuth(user.email);
            const role = isBootstrapStaffEmail(user.email) ? "staff" : "user";
            return { data: { ...user, role } };
          },
          after: async (user) => {
            await syncAccountForUser(user.id, user.email);
          },
        },
      },
      session: {
        create: {
          after: async (session) => {
            const row = readAuthUserById(authDb, session.userId);
            if (row !== undefined) {
              await syncAccountForUser(row.id, row.email);
            }
          },
        },
      },
    },
  });
}

export type RegistryAuth = ReturnType<typeof createRegistryAuth>;
