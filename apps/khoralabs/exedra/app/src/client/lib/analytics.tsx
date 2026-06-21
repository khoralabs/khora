import { createContext, type ReactNode, useCallback, useContext, useMemo } from "react";

import { track } from "./telemetry";

type AnalyticsContextValue = {
  sessionId?: string;
  orgId?: string;
};

const AnalyticsContext = createContext<AnalyticsContextValue>({});

export function AnalyticsProvider({
  sessionId,
  orgId,
  children,
}: AnalyticsContextValue & { children: ReactNode }) {
  const parent = useContext(AnalyticsContext);
  const value = useMemo(
    () => ({
      ...parent,
      ...(sessionId !== undefined ? { sessionId } : {}),
      ...(orgId !== undefined ? { orgId } : {}),
    }),
    [parent, sessionId, orgId],
  );
  return <AnalyticsContext.Provider value={value}>{children}</AnalyticsContext.Provider>;
}

export function useAnalytics() {
  const ctx = useContext(AnalyticsContext);
  return useCallback(
    (event: string, props?: Record<string, unknown>) => {
      track(event, { ...ctx, ...props });
    },
    [ctx],
  );
}
