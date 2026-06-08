import type {
  Account,
  AccountAgentLink,
  AgentAccountBinding,
  AgentAuthRegistration,
  CliLinkChallenge,
  DeviceAuthorization,
  MarketingConsent,
  Membership,
} from "@khoralabs/registry-accounts-contracts";
import type { SqlRow } from "./sql-row";

/** SQLite row shapes (snake_case columns) derived from domain types */
export type AccountRow = SqlRow<Account>;
export type MarketingConsentRow = SqlRow<MarketingConsent>;
export type MembershipRow = SqlRow<Membership>;
export type AccountAgentLinkRow = SqlRow<AccountAgentLink>;
export type AgentAccountBindingRow = SqlRow<AgentAccountBinding>;
export type DeviceAuthorizationRow = SqlRow<DeviceAuthorization>;
export type AgentAuthRegistrationRow = SqlRow<AgentAuthRegistration>;
export type CliLinkChallengeRow = SqlRow<CliLinkChallenge>;
