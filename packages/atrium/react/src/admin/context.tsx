import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useAdminCellDetail } from "./hooks/use-admin-cell-detail.ts";
import { useAdminPrincipalLookup } from "./hooks/use-admin-principal-lookup.ts";
import { useAdminSummary } from "./hooks/use-admin-summary.ts";
import type { AdminCellDetail, AdminCellShardSummary, AdminPrincipal, AdminSummary } from "./types.ts";

export type AdminStatsContextValue = {
  baseUrl: string;
  summary: AdminSummary | null;
  summaryLoading: boolean;
  summaryError: string | null;
  refetchSummary: () => Promise<void>;
  selectedCellId: string | null;
  selectCell: (cellId: string | null) => void;
  cellDetail: AdminCellDetail | null;
  cellDetailLoading: boolean;
  cellDetailError: string | null;
  principalDid: string;
  setPrincipalDid: (did: string) => void;
  principal: AdminPrincipal | null;
  principalLoading: boolean;
  principalError: string | null;
  lookupPrincipal: () => Promise<void>;
};

const AdminStatsContext = createContext<AdminStatsContextValue | null>(null);

export function useAdminStats(): AdminStatsContextValue {
  const ctx = useContext(AdminStatsContext);
  if (ctx === null) {
    throw new Error("useAdminStats must be used within AdminStats.Root");
  }
  return ctx;
}

export type AdminStatsProviderProps = {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  selectedCellId?: string | null;
  defaultSelectedCellId?: string | null;
  onSelectedCellIdChange?: (cellId: string | null) => void;
  children: ReactNode;
};

export function AdminStatsProvider({
  baseUrl = "/api/admin/stats",
  fetchImpl = fetch,
  selectedCellId: selectedCellIdProp,
  defaultSelectedCellId = null,
  onSelectedCellIdChange,
  children,
}: AdminStatsProviderProps) {
  const [uncontrolledCellId, setUncontrolledCellId] = useState<string | null>(defaultSelectedCellId);
  const selectedCellId = selectedCellIdProp !== undefined ? selectedCellIdProp : uncontrolledCellId;

  const selectCell = useCallback(
    (cellId: string | null) => {
      if (selectedCellIdProp === undefined) {
        setUncontrolledCellId(cellId);
      }
      onSelectedCellIdChange?.(cellId);
    },
    [onSelectedCellIdChange, selectedCellIdProp],
  );

  const { summary, isLoading: summaryLoading, error: summaryError, refetch } = useAdminSummary(
    baseUrl,
    fetchImpl,
  );
  const {
    detail: cellDetail,
    isLoading: cellDetailLoading,
    error: cellDetailError,
  } = useAdminCellDetail(baseUrl, selectedCellId, fetchImpl);
  const {
    did: principalDid,
    setDid: setPrincipalDid,
    result: principal,
    isLoading: principalLoading,
    error: principalError,
    lookup: lookupPrincipal,
  } = useAdminPrincipalLookup(baseUrl, fetchImpl);

  const value = useMemo(
    (): AdminStatsContextValue => ({
      baseUrl,
      summary,
      summaryLoading,
      summaryError,
      refetchSummary: refetch,
      selectedCellId,
      selectCell,
      cellDetail,
      cellDetailLoading,
      cellDetailError,
      principalDid,
      setPrincipalDid,
      principal,
      principalLoading,
      principalError,
      lookupPrincipal,
    }),
    [
      baseUrl,
      summary,
      summaryLoading,
      summaryError,
      refetch,
      selectedCellId,
      selectCell,
      cellDetail,
      cellDetailLoading,
      cellDetailError,
      principalDid,
      setPrincipalDid,
      principal,
      principalLoading,
      principalError,
      lookupPrincipal,
    ],
  );

  return <AdminStatsContext.Provider value={value}>{children}</AdminStatsContext.Provider>;
}

export function findCellShard(
  summary: AdminSummary | null,
  cellId: string,
): AdminCellShardSummary | undefined {
  return summary?.cells.shards.find((s) => s.cellId === cellId);
}

export function formatShardLabel(cellId: string): string {
  const match = /^colonnade-shard-(\d+)$/.exec(cellId);
  if (match !== null) return `shard-${match[1]}`;
  return cellId;
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
