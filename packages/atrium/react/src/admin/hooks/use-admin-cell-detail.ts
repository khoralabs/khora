import { useCallback, useEffect, useState } from "react";
import { fetchAdminJson } from "../client.ts";
import type { AdminCellDetail } from "../types.ts";

export function useAdminCellDetail(
  baseUrl: string,
  cellId: string | null,
  fetchImpl: typeof fetch = fetch,
) {
  const [detail, setDetail] = useState<AdminCellDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (cellId === null || cellId.length === 0) {
      setDetail(null);
      setError(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAdminJson<AdminCellDetail>(
        baseUrl,
        `/cell?cellId=${encodeURIComponent(cellId)}`,
        fetchImpl,
      );
      setDetail(data);
    } catch (err) {
      setDetail(null);
      setError(err instanceof Error ? err.message : "Failed to load cell detail");
    } finally {
      setIsLoading(false);
    }
  }, [baseUrl, cellId, fetchImpl]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { detail, isLoading, error, refetch };
}
