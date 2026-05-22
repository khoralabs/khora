import type {
  RegistryAdminSummary,
  RegistryEmailLookupResponse,
} from "@khoralabs/users";
import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
} from "react";
import { useRegistryEmailLookup } from "./hooks/use-registry-email-lookup.ts";
import { useRegistrySummary } from "./hooks/use-registry-summary.ts";

export type UsersStatsContextValue = {
  baseUrl: string;
  lookupBaseUrl: string;
  summary: RegistryAdminSummary | null;
  summaryLoading: boolean;
  summaryError: string | null;
  refetchSummary: () => Promise<void>;
  lookupEmail: string;
  setLookupEmail: (email: string) => void;
  emailLookup: RegistryEmailLookupResponse | null;
  emailLookupLoading: boolean;
  emailLookupError: string | null;
  runEmailLookup: () => Promise<void>;
};

const UsersStatsContext = createContext<UsersStatsContextValue | null>(null);

export function useUsersStats(): UsersStatsContextValue {
  const ctx = useContext(UsersStatsContext);
  if (ctx === null) {
    throw new Error("useUsersStats must be used within UsersStats.Root");
  }
  return ctx;
}

export type UsersStatsProviderProps = {
  baseUrl?: string;
  lookupBaseUrl?: string;
  fetchImpl?: typeof fetch;
  children: ReactNode;
};

export function UsersStatsProvider({
  baseUrl = "/admin/api/stats",
  lookupBaseUrl = "/admin/api/lookup",
  fetchImpl = fetch,
  children,
}: UsersStatsProviderProps) {
  const {
    summary,
    isLoading: summaryLoading,
    error: summaryError,
    refetch,
  } = useRegistrySummary(baseUrl, fetchImpl);
  const {
    email,
    setEmail,
    result,
    isLoading: emailLookupLoading,
    error: emailLookupError,
    lookup,
  } = useRegistryEmailLookup(lookupBaseUrl, fetchImpl);

  const value = useMemo(
    (): UsersStatsContextValue => ({
      baseUrl,
      lookupBaseUrl,
      summary,
      summaryLoading,
      summaryError,
      refetchSummary: refetch,
      lookupEmail: email,
      setLookupEmail: setEmail,
      emailLookup: result,
      emailLookupLoading,
      emailLookupError,
      runEmailLookup: lookup,
    }),
    [
      baseUrl,
      lookupBaseUrl,
      summary,
      summaryLoading,
      summaryError,
      refetch,
      email,
      setEmail,
      result,
      emailLookupLoading,
      emailLookupError,
      lookup,
    ],
  );

  return (
    <UsersStatsContext.Provider value={value}>{children}</UsersStatsContext.Provider>
  );
}
