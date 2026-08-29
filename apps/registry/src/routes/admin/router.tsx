import { parseHostDetailSlug } from "./nav.ts";
import { HostDetailPage } from "./pages/host-detail.tsx";
import { HostsDirectoryPage } from "./pages/hosts-directory.tsx";
import { LookupPage } from "./pages/lookup.tsx";
import { OverviewPage } from "./pages/overview.tsx";
import { usePathname } from "./use-pathname.ts";

export function AdminRouter() {
  const pathname = usePathname();

  if (parseHostDetailSlug(pathname) !== null) {
    return <HostDetailPage />;
  }
  if (pathname.startsWith("/admin/hosts")) {
    return <HostsDirectoryPage />;
  }
  if (pathname.startsWith("/admin/lookup")) {
    return <LookupPage />;
  }
  return <OverviewPage />;
}
