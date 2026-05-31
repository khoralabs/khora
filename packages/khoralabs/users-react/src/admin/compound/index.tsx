import {
  UsersStatsEmailLookup,
  UsersStatsEmailLookupForm,
  UsersStatsEmailLookupResult,
} from "./email-lookup";
import { UsersStatsHostList, UsersStatsHostListItem } from "./hosts";
import {
  UsersStatsAccountsMetrics,
  UsersStatsMarketingMetrics,
  UsersStatsOverview,
} from "./overview";
import { UsersStatsRoot } from "./root";

export const UsersStats = {
  Root: UsersStatsRoot,
  Overview: UsersStatsOverview,
  AccountsMetrics: UsersStatsAccountsMetrics,
  MarketingMetrics: UsersStatsMarketingMetrics,
  HostList: UsersStatsHostList,
  HostListItem: UsersStatsHostListItem,
  EmailLookup: UsersStatsEmailLookup,
  EmailLookupForm: UsersStatsEmailLookupForm,
  EmailLookupResult: UsersStatsEmailLookupResult,
} as const;
