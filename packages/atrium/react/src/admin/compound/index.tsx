import { AdminStatsRoot } from "./root.tsx";
import {
  AdminStatsCatalogMetrics,
  AdminStatsCellDetail,
  AdminStatsCellGrid,
  AdminStatsCellGridItem,
  AdminStatsCellUtilizationBar,
  AdminStatsFramesMetrics,
  AdminStatsInfrastructure,
} from "./infrastructure.tsx";
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

export const AdminStats = {
  Root: AdminStatsRoot,
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
