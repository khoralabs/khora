export type AccountStatus = "active" | "suspended" | "deleted";

export type Account = {
  id: string;
  status: AccountStatus;
  createdAtMs: number;
  updatedAtMs: number;
};

export type MarketingConsent = {
  id: string;
  email: string;
  accountId: string | null;
  listSlug: string;
  optedInAtMs: number;
  optedOutAtMs: number | null;
  sourceApp: string | null;
};

export type Membership = {
  id: string;
  accountId: string;
  hostId: string;
  createdAtMs: number;
};

export type AccountAgentLink = {
  id: string;
  membershipId: string;
  accountId: string;
  hostId: string;
  agentDid: string;
  linkedAtMs: number;
};

export type AgentAccountBinding = {
  agentDid: string;
  accountId: string;
  boundAtMs: number;
  boundViaHostId: string | null;
};

export type HostLinkPropagationResult = {
  hostId: string;
  ok: boolean;
  error?: string;
  linkId?: string;
};

export type CliLinkChallenge = {
  id: string;
  agentDid: string;
  nonce: string;
  expiresAtMs: number;
  consumedAtMs: number | null;
  createdAtMs: number;
};

export type RegistryEmailLookup = {
  email: string;
  account: Account | null;
  accountEmails: string[];
  marketingConsents: MarketingConsent[];
  membershipsCount: number;
};

export type RegistryAccountLookup = {
  account: Account;
  accountEmails: string[];
  marketingConsents: MarketingConsent[];
  membershipsCount: number;
};

export type RegistryAuthUser = {
  id: string;
  email: string;
  role: string | null;
};

export type RegistryEmailLookupResponse = RegistryEmailLookup & {
  authUser: RegistryAuthUser | null;
};
