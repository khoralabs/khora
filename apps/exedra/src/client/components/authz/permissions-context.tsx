import type { OrgPermission, TeamPermission } from "@shared/authz/permissions";
import { createContext, type ReactNode, useContext, useMemo } from "react";

type PermissionsContextValue = {
  org?: Partial<Record<OrgPermission, boolean>>;
  team?: Partial<Record<TeamPermission, boolean>>;
};

const PermissionsContext = createContext<PermissionsContextValue | null>(null);

type PermissionsProviderProps = {
  value: PermissionsContextValue;
  children: ReactNode;
};

export function PermissionsProvider({ value, children }: PermissionsProviderProps) {
  const memoized = useMemo(() => value, [value.org, value.team, value]);
  return <PermissionsContext.Provider value={memoized}>{children}</PermissionsContext.Provider>;
}

export function usePermissionsContext(): PermissionsContextValue {
  return useContext(PermissionsContext) ?? {};
}

export function useOrgPermission(permission: OrgPermission): boolean {
  const { org } = usePermissionsContext();
  return org?.[permission] === true;
}

export function useTeamPermission(permission: TeamPermission): boolean {
  const { team } = usePermissionsContext();
  return team?.[permission] === true;
}
