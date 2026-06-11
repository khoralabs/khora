import { AdminStatsInactiveMembers } from "./inactive-members";
import {
  AdminStatsCatalogMetrics,
  AdminStatsCellDetail,
  AdminStatsCellGrid,
  AdminStatsCellGridItem,
  AdminStatsCellUtilizationBar,
  AdminStatsInfrastructure,
} from "./infrastructure";
import { AdminStatsNetworkActivity } from "./network-activity";
import {
  AdminStatsInvitesMetrics,
  AdminStatsOperations,
  AdminStatsTeardownMetrics,
} from "./operations";
import {
  AdminStatsPrincipalLookup,
  AdminStatsPrincipalLookupForm,
  AdminStatsPrincipalLookupResult,
} from "./principal-lookup";
import { AdminStatsRoot } from "./root";

export const AdminStats = {
  Root: AdminStatsRoot,
  NetworkActivity: AdminStatsNetworkActivity,
  InactiveMembers: AdminStatsInactiveMembers,
  Infrastructure: AdminStatsInfrastructure,
  CatalogMetrics: AdminStatsCatalogMetrics,
  CellUtilizationBar: AdminStatsCellUtilizationBar,
  CellGrid: AdminStatsCellGrid,
  CellGridItem: AdminStatsCellGridItem,
  CellDetail: AdminStatsCellDetail,
  Operations: AdminStatsOperations,
  InvitesMetrics: AdminStatsInvitesMetrics,
  TeardownMetrics: AdminStatsTeardownMetrics,
  PrincipalLookup: AdminStatsPrincipalLookup,
  PrincipalLookupForm: AdminStatsPrincipalLookupForm,
  PrincipalLookupResult: AdminStatsPrincipalLookupResult,
} as const;
