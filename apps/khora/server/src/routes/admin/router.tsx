import { InfrastructurePage } from "./pages/infrastructure.tsx";
import { LookupPage } from "./pages/lookup.tsx";
import { NetworkPage } from "./pages/network.tsx";
import { OperationsPage } from "./pages/operations.tsx";
import { OverviewPage } from "./pages/overview.tsx";
import { RegistryPage } from "./pages/registry.tsx";
import { usePathname } from "./use-pathname.ts";

export function AdminRouter() {
  const pathname = usePathname();

  if (pathname.startsWith("/admin/network")) {
    return <NetworkPage />;
  }
  if (pathname.startsWith("/admin/infrastructure")) {
    return <InfrastructurePage />;
  }
  if (pathname.startsWith("/admin/operations")) {
    return <OperationsPage />;
  }
  if (pathname.startsWith("/admin/registry")) {
    return <RegistryPage />;
  }
  if (pathname.startsWith("/admin/lookup")) {
    return <LookupPage />;
  }
  return <OverviewPage />;
}
