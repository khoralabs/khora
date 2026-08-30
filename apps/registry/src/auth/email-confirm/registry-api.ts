import type {
  EmailConfirmApi,
  EmailConfirmResult,
  EmailConfirmSession,
  SendOtpParams,
  VerifyOtpParams,
} from "@khoralabs/registry/email-confirm";
import { createUsersAuthClient } from "../browser-auth-client";

function mapSession(data: {
  user: { id: string; email: string; name?: string | null; role?: string | null };
}): EmailConfirmSession {
  return {
    user: {
      id: data.user.id,
      email: data.user.email,
      ...(data.user.name != null && data.user.name.length > 0 ? { name: data.user.name } : {}),
      ...(data.user.role != null && data.user.role.length > 0 ? { role: data.user.role } : {}),
    },
  };
}

export function createRegistryEmailConfirmApi(opts: { registryUrl: string }): EmailConfirmApi {
  const base = opts.registryUrl.replace(/\/$/, "");
  const authClient = createUsersAuthClient({ registryUrl: base });

  return {
    async sendOtp(params: SendOtpParams): Promise<EmailConfirmResult> {
      const { error } = await authClient.emailOtp.sendVerificationOtp({
        email: params.email,
        type: "sign-in",
      });
      if (error) {
        return { ok: false, error: error.message ?? "Failed to send code" };
      }
      return { ok: true };
    },

    async verifyOtp(
      params: VerifyOtpParams,
    ): Promise<EmailConfirmResult & { session?: EmailConfirmSession }> {
      const { data, error } = await authClient.signIn.emailOtp({
        email: params.email,
        otp: params.otp,
      });
      if (error || data?.user == null) {
        return { ok: false, error: error?.message ?? "Verification failed" };
      }
      return {
        ok: true,
        session: mapSession({ user: data.user }),
      };
    },

    async confirmSession(): Promise<EmailConfirmResult & { session?: EmailConfirmSession }> {
      const { data, error } = await authClient.getSession();
      if (error || data?.user == null) {
        return {
          ok: false,
          error: error?.message ?? "Session could not be verified. Try again.",
        };
      }
      return { ok: true, session: mapSession({ user: data.user }) };
    },
  };
}
