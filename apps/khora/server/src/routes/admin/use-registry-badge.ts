import { useEffect, useState } from "react";

export type RegistryBadge = {
  label: string;
  variant: "default" | "secondary" | "outline" | "destructive";
};

export function useRegistryBadge(): RegistryBadge | undefined {
  const [badge, setBadge] = useState<RegistryBadge | undefined>(undefined);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/admin/api/registry");
        const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok || json.configured !== true) {
          setBadge({ label: "Registry not connected", variant: "outline" });
          return;
        }
        const status = typeof json.status === "string" ? json.status : "unknown";
        if (status === "active") {
          setBadge({ label: "Registry active", variant: "default" });
        } else if (status === "pending" || status === "pending-token") {
          setBadge({ label: "Registry pending", variant: "secondary" });
        } else if (status === "suspended") {
          setBadge({ label: "Registry suspended", variant: "destructive" });
        } else {
          setBadge({ label: `Registry ${status}`, variant: "outline" });
        }
      } catch {
        setBadge(undefined);
      }
    })();
  }, []);

  return badge;
}
