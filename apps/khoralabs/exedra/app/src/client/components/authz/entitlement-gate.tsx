import type { OrgPermission, TeamPermission } from "@shared/authz/permissions";
import type { ReactNode } from "react";

import { useOrgPermission, useTeamPermission } from "./permissions-context";

type OrgEntitlementGateProps = {
  permission: OrgPermission;
  children: ReactNode;
  fallback?: ReactNode;
};

type TeamEntitlementGateProps = {
  permission: TeamPermission;
  children: ReactNode;
  fallback?: ReactNode;
};

type EntitlementGateProps =
  | ({ scope: "org" } & OrgEntitlementGateProps)
  | ({ scope: "team" } & TeamEntitlementGateProps);

function OrgEntitlementGate({ permission, children, fallback = null }: OrgEntitlementGateProps) {
  const granted = useOrgPermission(permission);
  return granted ? children : fallback;
}

function TeamEntitlementGate({ permission, children, fallback = null }: TeamEntitlementGateProps) {
  const granted = useTeamPermission(permission);
  return granted ? children : fallback;
}

export function EntitlementGate(props: EntitlementGateProps) {
  if (props.scope === "org") {
    return (
      <OrgEntitlementGate permission={props.permission} fallback={props.fallback}>
        {props.children}
      </OrgEntitlementGate>
    );
  }
  return (
    <TeamEntitlementGate permission={props.permission} fallback={props.fallback}>
      {props.children}
    </TeamEntitlementGate>
  );
}
