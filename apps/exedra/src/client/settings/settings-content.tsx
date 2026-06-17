import { useEffect } from "react";

import type { AppChromeContext } from "../shell/app-chrome";
import { CompactChromeHeader } from "../shell/compact-chrome-header";
import {
  parseSettingsSection,
  type SettingsSection,
  settingsPathForSection,
} from "../shell/routes";

import { AccountSettingsForm } from "./account-settings-form";
import { OrganizationSettingsForm } from "./organization-settings-form";
import { TeamSettingsForm } from "./team-settings-form";

type SettingsContentProps = Pick<
  AppChromeContext,
  "me" | "pathname" | "onNavigate" | "activeTeam" | "onProfileRefresh"
>;

const SECTION_TITLES: Record<SettingsSection, string> = {
  organization: "Organization",
  team: "Team",
  account: "Account",
};

export function SettingsContent({
  me,
  pathname,
  onNavigate,
  activeTeam,
  onProfileRefresh,
}: SettingsContentProps) {
  const section = parseSettingsSection(pathname);

  useEffect(() => {
    if (pathname === "/settings" || pathname === "/settings/") {
      onNavigate(settingsPathForSection("account"));
    }
  }, [pathname, onNavigate]);

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <CompactChromeHeader compactOnly title={SECTION_TITLES[section]} />
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {section === "organization" ? (
          <OrganizationSettingsForm activeTeam={activeTeam} onSaved={onProfileRefresh} />
        ) : section === "team" ? (
          <TeamSettingsForm activeTeam={activeTeam} onSaved={onProfileRefresh} />
        ) : (
          <AccountSettingsForm user={me.user} activeTeam={activeTeam} onSaved={onProfileRefresh} />
        )}
      </div>
    </div>
  );
}
