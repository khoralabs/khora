import { BarChart3, Boxes, CreditCard } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { AppChromeContext } from "../shell/app-chrome";
import {
  parseSettingsRoute,
  settingsAccountPath,
  settingsBreadcrumbs,
  settingsRedirectFor,
} from "../shell/routes";

import { AccountSettingsForm } from "./account-settings-form";
import { ComingSoon } from "./coming-soon";
import { OrganizationAccessSettings } from "./organization-access-settings";
import { OrganizationMembersSettings } from "./organization-members-settings";
import { OrganizationSettingsForm } from "./organization-settings-form";
import { OrganizationTeamsSettings } from "./organization-teams-settings";
import { SettingsHeader } from "./settings-header";
import { TeamSettingsForm } from "./team-settings-form";
import { UserAccountSettings } from "./user-account-settings";

type SettingsContentProps = Pick<
  AppChromeContext,
  "me" | "pathname" | "onNavigate" | "activeTeam" | "onProfileRefresh"
>;

const COMING_SOON: Record<string, { title: string; description: string; icon: typeof CreditCard }> =
  {
    billing: {
      title: "Billing",
      description: "Plans, invoices, and payment methods will live here.",
      icon: CreditCard,
    },
    usage: {
      title: "Usage",
      description: "Track activity and consumption across your organization.",
      icon: BarChart3,
    },
    models: {
      title: "Models",
      description: "Configure the models available to your organization.",
      icon: Boxes,
    },
  };

export function SettingsContent({
  me,
  pathname,
  onNavigate,
  activeTeam,
  onProfileRefresh,
}: SettingsContentProps) {
  const [detail, setDetail] = useState<{ path: string; title: string } | null>(null);
  const route = parseSettingsRoute(pathname);
  const detailTitle = detail?.path === pathname ? detail.title : undefined;
  const resolveTitle = useCallback(
    (title: string) => setDetail({ path: pathname, title }),
    [pathname],
  );

  useEffect(() => {
    const redirect = settingsRedirectFor(pathname);
    if (redirect !== null) onNavigate(redirect);
  }, [pathname, onNavigate]);

  const breadcrumbs = settingsBreadcrumbs(route, {
    orgName: activeTeam.orgName,
    teamName: route.area === "teams" ? detailTitle : undefined,
    memberName: route.area === "members" ? detailTitle : undefined,
  });

  function renderBody() {
    if (route.scope === "account") {
      return (
        <AccountSettingsForm user={me.user} activeTeam={activeTeam} onSaved={onProfileRefresh} />
      );
    }

    switch (route.area) {
      case "general":
        return <OrganizationSettingsForm activeTeam={activeTeam} onSaved={onProfileRefresh} />;
      case "members":
        return route.userId !== undefined ? (
          <UserAccountSettings
            orgId={activeTeam.orgId}
            userId={route.userId}
            onNavigateToOwnAccount={() => onNavigate(settingsAccountPath())}
            onTitleResolved={resolveTitle}
          />
        ) : (
          <OrganizationMembersSettings activeTeam={activeTeam} onNavigate={onNavigate} />
        );
      case "teams":
        return route.teamId !== undefined ? (
          <TeamSettingsForm
            teamId={route.teamId}
            subArea={route.teamSubArea ?? "general"}
            onSaved={onProfileRefresh}
            onNavigate={onNavigate}
            onTitleResolved={resolveTitle}
          />
        ) : (
          <OrganizationTeamsSettings activeTeam={activeTeam} onNavigate={onNavigate} />
        );
      case "access":
        return <OrganizationAccessSettings activeTeam={activeTeam} onNavigate={onNavigate} />;
      default: {
        const placeholder = COMING_SOON[route.area];
        return placeholder !== undefined ? (
          <ComingSoon
            title={placeholder.title}
            description={placeholder.description}
            icon={placeholder.icon}
          />
        ) : (
          <OrganizationSettingsForm activeTeam={activeTeam} onSaved={onProfileRefresh} />
        );
      }
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <SettingsHeader breadcrumbs={breadcrumbs} onNavigate={onNavigate} />
      <div className="min-h-0 flex-1 overflow-y-auto p-6">{renderBody()}</div>
    </div>
  );
}
