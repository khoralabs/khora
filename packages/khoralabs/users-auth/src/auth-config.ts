import { linkBetterAuthUser } from "@khoralabs/users";
import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import { isBootstrapStaffEmail, normalizeEmail } from "./bootstrap";
import { getRegistryDatabase } from "./db";
import { sendOtpEmail } from "./ses";

export type RegistryAuthOptions = {
  baseURL?: string;
  trustedOrigins?: string[];
};

function readRegistryPort(): string {
  return process.env.PORT?.trim() ?? "4000";
}

function readAuthEnv(opts: RegistryAuthOptions = {}): {
  baseURL: string;
  secret: string;
  trustedOrigins: string[];
  cookieDomain: string | undefined;
} {
  const port = readRegistryPort();
  const localOrigin = `http://localhost:${port}`;
  const loopbackOrigin = `http://127.0.0.1:${port}`;
  const configuredUrl =
    opts.baseURL?.trim()?.replace(/\/$/, "") ??
    process.env.REGISTRY_URL?.trim()?.replace(/\/$/, "") ??
    process.env.BETTER_AUTH_URL?.trim()?.replace(/\/$/, "");
  const baseURL = configuredUrl ?? localOrigin;

  const envOrigins =
    process.env.REGISTRY_TRUSTED_ORIGINS?.trim()
      .split(",")
      .map((o) => o.trim())
      .filter((o) => o.length > 0) ?? [];
  const trustedOrigins = [
    ...new Set([
      baseURL,
      localOrigin,
      loopbackOrigin,
      ...envOrigins,
      ...(opts.trustedOrigins ?? []),
    ]),
  ];

  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (secret === undefined || secret.length < 32) {
    console.warn(
      "[users-auth] BETTER_AUTH_SECRET missing or too short (<32 chars). " +
        "Set it in the registry app environment.",
    );
  }

  const cookieDomain = process.env.REGISTRY_COOKIE_DOMAIN?.trim() || undefined;
  return {
    baseURL,
    secret: secret ?? "dev-only-insecure-secret-replace-me-32chars",
    trustedOrigins,
    cookieDomain,
  };
}

function syncAccountForUser(userId: string, email: string): void {
  linkBetterAuthUser(getRegistryDatabase(), {
    providerSubject: userId,
    email,
  });
}

export function createRegistryAuth(opts: RegistryAuthOptions = {}) {
  const { baseURL, secret, trustedOrigins, cookieDomain } = readAuthEnv(opts);
  return betterAuth({
    database: getRegistryDatabase(),
    baseURL,
    basePath: "/api/auth",
    secret,
    trustedOrigins,
    ...(cookieDomain !== undefined
      ? {
          advanced: {
            crossSubDomainCookies: {
              enabled: true,
              domain: cookieDomain,
            },
          },
        }
      : {}),
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
        async sendVerificationOTP({ email, otp, type }) {
          if (type !== "sign-in") return;
          void sendOtpEmail({ email: normalizeEmail(email), otp }).catch((err: unknown) => {
            console.error("[users-auth] failed to send OTP email:", err);
          });
        },
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
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
