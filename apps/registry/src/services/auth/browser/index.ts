export type {
  EmailConfirmApi,
  EmailConfirmPurpose,
  EmailConfirmResult,
  EmailConfirmSession,
  EmailConfirmUser,
  SendOtpParams,
  SubscribeMarketingParams,
  VerifyOtpParams,
} from "@khoralabs/registry/email-confirm";
export { createUsersAuthClient } from "./auth-client";
export { createRegistryEmailConfirmApi } from "./email-confirm-api";
