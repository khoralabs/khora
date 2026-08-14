import { useState } from "react";
import { AdminStats } from "../../khora-react";
import { renderRoute } from "../../render-route";
import { AdminRouter } from "./router";
import { AdminShell } from "./shell";
import { useAdminSession } from "./use-session";
import "../../../styles/globals.css";

function AdminApp() {
  const authenticated = useAdminSession();
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
      <AdminShell>
        <AdminRouter />
      </AdminShell>
    </AdminStats.Root>
  );
}

renderRoute(AdminApp);
