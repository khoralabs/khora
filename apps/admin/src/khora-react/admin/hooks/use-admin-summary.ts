import { useCallback, useEffect, useState } from "react";
import { fetchAdminJson } from "../client";
import type { AdminSummary } from "../types";

export function useAdminSummary(baseUrl: string, fetchImpl: typeof fetch = fetch) {
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAdminJson<AdminSummary>(baseUrl, "/summary", fetchImpl);
      setSummary(data);
    } catch (err) {
      setSummary(null);
      setError(err instanceof Error ? err.message : "Failed to load summary");
    } finally {
      setIsLoading(false);
    }
  }, [baseUrl, fetchImpl]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { summary, isLoading, error, refetch };
}
