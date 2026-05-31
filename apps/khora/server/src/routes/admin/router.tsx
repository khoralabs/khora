import { GraphPage } from "./pages/graph";
import { InfrastructurePage } from "./pages/infrastructure";
import { LookupPage } from "./pages/lookup";
import { NetworkPage } from "./pages/network";
import { OperationsPage } from "./pages/operations";
import { OverviewPage } from "./pages/overview";
import { RegistryPage } from "./pages/registry";
import { usePathname } from "./use-pathname";

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
  if (pathname.startsWith("/admin/graph")) {
    return <GraphPage />;
  }
  if (pathname.startsWith("/admin/lookup")) {
    return <LookupPage />;
  }
  return <OverviewPage />;
}
