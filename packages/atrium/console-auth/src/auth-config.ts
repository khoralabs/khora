import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { emailOTP } from "better-auth/plugins";
import { isBootstrapAdminEmail, normalizeEmail } from "./allowlist.ts";
import { getAuthDatabase } from "./db.ts";
import { sendOtpEmail } from "./ses.ts";
import { canReceiveAdminOtp, canSignInAsAdmin } from "./users.ts";

function readAuthEnv(): { baseURL: string; secret: string; trustedOrigins: string[] } {
  const port = process.env.PORT?.trim() ?? "3000";
  const localOrigin = `http://localhost:${port}`;
  const configuredUrl = process.env.BETTER_AUTH_URL?.trim()?.replace(/\/$/, "");
  const baseURL = configuredUrl ?? localOrigin;
  const trustedOrigins = [...new Set([baseURL, localOrigin])];

  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (secret === undefined || secret.length < 32) {
    console.warn(
      "[atrium-console-auth] BETTER_AUTH_SECRET missing or too short (<32 chars). " +
        "Set it in apps/atrium/homepage/.env (not .env.example). " +
        `cwd=${process.cwd()}, PORT=${port}.`,
    );
  }
  return {
    baseURL,
    secret: secret ?? "dev-only-insecure-secret-replace-me-32chars",
    trustedOrigins: [...trustedOrigins],
  };
}

export function createAuthInstance() {
  const { baseURL, secret, trustedOrigins } = readAuthEnv();
  return betterAuth({
    database: getAuthDatabase(),
    baseURL,
    secret,
    trustedOrigins,
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
          if (!(await canReceiveAdminOtp(email))) return;
          void sendOtpEmail({ email: normalizeEmail(email), otp }).catch((err: unknown) => {
            console.error("[atrium-console-auth] failed to send OTP email:", err);
          });
        },
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!isBootstrapAdminEmail(user.email)) {
              throw new APIError("BAD_REQUEST", { message: "Sign up is disabled" });
            }
            return { data: { ...user, role: "admin" } };
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/sign-in/email-otp") {
          const body = ctx.body as { email?: string } | undefined;
          const email = typeof body?.email === "string" ? body.email : "";
          if (!(await canSignInAsAdmin(email))) {
            throw new APIError("FORBIDDEN", { message: "Not authorized" });
          }
        }
        if (ctx.path === "/email-otp/send-verification-otp") {
          const body = ctx.body as { email?: string; type?: string } | undefined;
          if (body?.type === "sign-in") {
            const email = typeof body.email === "string" ? body.email : "";
            if (!(await canReceiveAdminOtp(email))) {
              throw new APIError("FORBIDDEN", { message: "Not authorized" });
            }
          }
        }
      }),
    },
  });
}
