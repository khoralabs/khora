import { UsersStats } from "@khoralabs/registry-catalog-react/admin";
import { renderRoute } from "../../render-route.tsx";
import { AdminRouter } from "./router.tsx";
import { AdminShell } from "./shell.tsx";
import { usePendingHostsBadge } from "./use-pending-hosts-badge.ts";
import { useAdminSession } from "./use-session.ts";
import "../../../styles/globals.css";

function AdminAppInner() {
  const pendingBadge = usePendingHostsBadge();

  return (
    <AdminShell pendingBadge={pendingBadge}>
      <AdminRouter />
    </AdminShell>
  );
}

function AdminApp() {
  const authenticated = useAdminSession();

  if (authenticated !== true) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Loading session…</p>
      </main>
    );
  }

  return (
    <UsersStats.Root baseUrl="/admin/api/stats" lookupBaseUrl="/admin/api/lookup">
      <AdminAppInner />
    </UsersStats.Root>
  );
}

renderRoute(AdminApp);
