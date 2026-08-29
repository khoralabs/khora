export type EmailConfirmPurpose = "sign-in" | "sign-up";

export type EmailConfirmUser = {
  id: string;
  email: string;
  name?: string;
  role?: string;
};

export type EmailConfirmSession = {
  user: EmailConfirmUser;
};

export type SendOtpParams = {
  email: string;
  purpose: EmailConfirmPurpose;
};

export type VerifyOtpParams = {
  email: string;
  otp: string;
  purpose: EmailConfirmPurpose;
};

export type SubscribeMarketingParams = {
  email: string;
  listSlug: string;
  sourceApp?: string;
};

export type EmailConfirmResult = { ok: true } | { ok: false; error: string };

export interface EmailConfirmApi {
  sendOtp(params: SendOtpParams): Promise<EmailConfirmResult>;
  verifyOtp(
    params: VerifyOtpParams,
  ): Promise<EmailConfirmResult & { session?: EmailConfirmSession }>;
  confirmSession(): Promise<EmailConfirmResult & { session?: EmailConfirmSession }>;
  subscribeMarketing?(params: SubscribeMarketingParams): Promise<EmailConfirmResult>;
}
