import {
  UsersStatsAccessRequestsMetrics,
  UsersStatsAccountsMetrics,
  UsersStatsMarketingMetrics,
  UsersStatsOverview,
} from "./overview.tsx";
import { UsersStatsHostList, UsersStatsHostListItem } from "./hosts.tsx";
import {
  UsersStatsEmailLookup,
  UsersStatsEmailLookupForm,
  UsersStatsEmailLookupResult,
} from "./email-lookup.tsx";
import { UsersStatsRoot } from "./root.tsx";

export const UsersStats = {
  Root: UsersStatsRoot,
  Overview: UsersStatsOverview,
  AccountsMetrics: UsersStatsAccountsMetrics,
  AccessRequestsMetrics: UsersStatsAccessRequestsMetrics,
  MarketingMetrics: UsersStatsMarketingMetrics,
  HostList: UsersStatsHostList,
  HostListItem: UsersStatsHostListItem,
  EmailLookup: UsersStatsEmailLookup,
  EmailLookupForm: UsersStatsEmailLookupForm,
  EmailLookupResult: UsersStatsEmailLookupResult,
} as const;
