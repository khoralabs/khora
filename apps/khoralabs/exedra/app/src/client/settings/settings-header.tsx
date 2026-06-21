import { Fragment } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { CompactChromeHeader } from "../shell/compact-chrome-header";
import type { SettingsBreadcrumb } from "../shell/routes";

type SettingsHeaderProps = {
  breadcrumbs: SettingsBreadcrumb[];
  onNavigate: (path: string) => void;
};

export function SettingsHeader({ breadcrumbs, onNavigate }: SettingsHeaderProps) {
  return (
    <CompactChromeHeader
      leading={
        <Breadcrumb className="min-w-0 flex-1">
          <BreadcrumbList>
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return (
                <Fragment key={`${crumb.label}-${crumb.path ?? "current"}`}>
                  <BreadcrumbItem className="min-w-0">
                    {crumb.path !== undefined && !isLast ? (
                      <BreadcrumbLink
                        className="truncate"
                        onClick={() => crumb.path !== undefined && onNavigate(crumb.path)}
                      >
                        {crumb.label}
                      </BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                  {!isLast ? <BreadcrumbSeparator /> : null}
                </Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      }
    />
  );
}
