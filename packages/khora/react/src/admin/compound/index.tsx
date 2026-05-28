import { AdminStatsInactiveMembers } from "./inactive-members.tsx";
import {
  AdminStatsCatalogMetrics,
  AdminStatsCellDetail,
  AdminStatsCellGrid,
  AdminStatsCellGridItem,
  AdminStatsCellUtilizationBar,
  AdminStatsFramesMetrics,
  AdminStatsInfrastructure,
} from "./infrastructure.tsx";
import { AdminStatsNetworkActivity } from "./network-activity.tsx";
import {
  AdminStatsInvitesMetrics,
  AdminStatsOperations,
  AdminStatsTeardownMetrics,
} from "./operations.tsx";
import {
  AdminStatsPrincipalLookup,
  AdminStatsPrincipalLookupForm,
  AdminStatsPrincipalLookupResult,
} from "./principal-lookup.tsx";
import { AdminStatsRoot } from "./root.tsx";

export const AdminStats = {
  Root: AdminStatsRoot,
  NetworkActivity: AdminStatsNetworkActivity,
  InactiveMembers: AdminStatsInactiveMembers,
  Infrastructure: AdminStatsInfrastructure,
  CatalogMetrics: AdminStatsCatalogMetrics,
  FramesMetrics: AdminStatsFramesMetrics,
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
