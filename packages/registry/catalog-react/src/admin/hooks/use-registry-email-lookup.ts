import type { RegistryEmailLookupResponse } from "@khoralabs/registry-catalog-contracts";
import { useCallback, useState } from "react";
import { fetchAdminJson } from "../client";

export function useRegistryEmailLookup(lookupBaseUrl: string, fetchImpl: typeof fetch = fetch) {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<RegistryEmailLookupResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = useCallback(async () => {
    const trimmed = email.trim();
    if (trimmed.length === 0) {
      setError("Enter an email");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAdminJson<RegistryEmailLookupResponse>(
        lookupBaseUrl,
        `/email?email=${encodeURIComponent(trimmed)}`,
        fetchImpl,
      );
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setIsLoading(false);
    }
  }, [email, fetchImpl, lookupBaseUrl]);

  return { email, setEmail, result, isLoading, error, lookup };
}
