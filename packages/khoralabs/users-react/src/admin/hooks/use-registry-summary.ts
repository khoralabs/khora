import type { RegistryAdminSummary } from "@khoralabs/users";
import { useCallback, useEffect, useState } from "react";
import { fetchAdminJson } from "../client";

export function useRegistrySummary(baseUrl: string, fetchImpl: typeof fetch = fetch) {
  const [summary, setSummary] = useState<RegistryAdminSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAdminJson<RegistryAdminSummary>(baseUrl, "/summary", fetchImpl);
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
