import { AdminStats } from "@khoralabs/khora-react";
import { useState } from "react";
import { renderRoute } from "../../render-route";
import { AdminRouter } from "./router";
import { AdminShell } from "./shell";
import { useRegistryBadge } from "./use-registry-badge";
import { useAdminSession } from "./use-session";
import "../../../styles/globals.css";

function AdminApp() {
  const authenticated = useAdminSession();
  const registryBadge = useRegistryBadge();
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);

  if (authenticated !== true) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Loading session…</p>
      </main>
    );
  }

  return (
    <AdminStats.Root
      baseUrl="/admin/api/stats"
      selectedCellId={selectedCellId}
      onSelectedCellIdChange={setSelectedCellId}
    >
      <AdminShell registryBadge={registryBadge}>
        <AdminRouter />
      </AdminShell>
    </AdminStats.Root>
  );
}

renderRoute(AdminApp);
