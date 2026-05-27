export { createUsersAuthClient } from "./browser-auth-client";
export { createRegistryEmailConfirmApi } from "./email-confirm/registry-api";
export type {
  EmailConfirmApi,
  EmailConfirmPurpose,
  EmailConfirmResult,
  EmailConfirmSession,
  EmailConfirmUser,
  SendOtpParams,
  SubscribeMarketingParams,
  VerifyOtpParams,
} from "./email-confirm/types";
