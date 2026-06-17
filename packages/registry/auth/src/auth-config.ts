import { findBlockedEmail, linkBetterAuthUser } from "@khoralabs/registry-accounts";
import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import { isBootstrapStaffEmail, normalizeEmail } from "./bootstrap";
import { getRegistryDatabase } from "./db";
import { sendOtpEmail } from "./ses";

export type RegistryAuthOptions = {
  baseURL?: string;
  /** Returns all browser origins allowed to call /api/auth (registry + trusted host origins). */
  resolveTrustedOrigins?: () => string[];
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
    console.warn(
      "[registry-auth] BETTER_AUTH_SECRET missing or too short (<32 chars). " +
        "Set it in the registry app environment.",
    );
  }

  const cookieDomain = resolveRegistryCookieDomain(
    baseURL,
    process.env.REGISTRY_COOKIE_DOMAIN,
    process.env.REGISTRY_COOKIE_PARENT_DOMAIN,
  );
  return {
    baseURL,
    secret: secret ?? "dev-only-insecure-secret-replace-me-32chars",
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

function syncAccountForUser(userId: string, email: string): void {
  linkBetterAuthUser(getRegistryDatabase(), {
    providerSubject: userId,
    email,
  });
}

function assertEmailAllowedForAuth(email: string): void {
  const blocked = findBlockedEmail(getRegistryDatabase(), email);
  if (blocked !== null) {
    throw new Error("email blocked");
  }
}

export function createRegistryAuth(opts: RegistryAuthOptions = {}) {
  const { baseURL, secret, cookieDomain } = readAuthEnv(opts);
  const port = readRegistryPort();
  const fallbackOrigins = [baseURL, `http://localhost:${port}`, `http://127.0.0.1:${port}`];

  return betterAuth({
    database: getRegistryDatabase(),
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
            console.error("[registry-auth] failed to send OTP email:", err);
          });
        },
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            assertEmailAllowedForAuth(user.email);
            const role = isBootstrapStaffEmail(user.email) ? "staff" : "user";
            return { data: { ...user, role } };
          },
          after: async (user) => {
            syncAccountForUser(user.id, user.email);
          },
        },
      },
      session: {
        create: {
          after: async (session) => {
            const db = getRegistryDatabase();
            const row = db
              .prepare(`SELECT id, email FROM user WHERE id = ? LIMIT 1`)
              .get(session.userId) as { id: string; email: string } | null;
            if (row !== null) {
              syncAccountForUser(row.id, row.email);
            }
          },
        },
      },
    },
  });
}

export type RegistryAuth = ReturnType<typeof createRegistryAuth>;
