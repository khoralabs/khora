import { useCallback, useState } from "react";
import { fetchAdminJson } from "../client.ts";
import type { AdminPrincipal } from "../types.ts";

export function useAdminPrincipalLookup(baseUrl: string, fetchImpl: typeof fetch = fetch) {
  const [did, setDid] = useState("");
  const [result, setResult] = useState<AdminPrincipal | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = useCallback(async () => {
    const trimmed = did.trim();
    if (trimmed.length === 0) {
      setError("Enter a DID");
      setResult(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await fetchAdminJson<AdminPrincipal>(
        baseUrl,
        `/principal?did=${encodeURIComponent(trimmed)}`,
        fetchImpl,
      );
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Failed to load principal");
    } finally {
      setIsLoading(false);
    }
  }, [baseUrl, did, fetchImpl]);

  return { did, setDid, result, isLoading, error, lookup };
}
