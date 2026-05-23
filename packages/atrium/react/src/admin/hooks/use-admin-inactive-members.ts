import { useCallback, useEffect, useState } from "react";
import { fetchAdminJson } from "../client.ts";
import type { AdminInactiveMembersResult } from "../types.ts";

export function useAdminInactiveMembers(
  baseUrl: string,
  inactiveDays: number,
  fetchImpl: typeof fetch = fetch,
) {
  const [data, setData] = useState<AdminInactiveMembersResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchAdminJson<AdminInactiveMembersResult>(
        baseUrl,
        `/inactive-members?days=${inactiveDays}`,
        fetchImpl,
      );
      setData(result);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Failed to load inactive members");
    } finally {
      setIsLoading(false);
    }
  }, [baseUrl, fetchImpl, inactiveDays]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, isLoading, error, refetch };
}

function formatRelativeMs(ms: number | null): string {
  if (ms === null) return "never";
  const delta = Date.now() - ms;
  const days = Math.floor(delta / (24 * 60 * 60 * 1000));
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export { formatRelativeMs };
