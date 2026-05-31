import { useCallback, useEffect, useState } from "react";

export type RegistryBadge = {
  label: string;
  variant: "default" | "secondary" | "outline" | "destructive";
};

function badgeFromRegistryJson(json: Record<string, unknown>, resOk: boolean): RegistryBadge {
  if (!resOk || json.configured !== true) {
    return { label: "Registry not connected", variant: "outline" };
  }
  const status = typeof json.status === "string" ? json.status : "unknown";
  if (status === "active") {
    return { label: "Registry active", variant: "default" };
  }
  if (status === "pending" || status === "pending-token") {
    return { label: "Registry pending", variant: "secondary" };
  }
  if (status === "suspended") {
    return { label: "Registry suspended", variant: "destructive" };
  }
  return { label: `Registry ${status}`, variant: "outline" };
}

export function useRegistryBadge(): RegistryBadge | undefined {
  const [badge, setBadge] = useState<RegistryBadge | undefined>(undefined);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/admin/api/registry");
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      setBadge(badgeFromRegistryJson(json, res.ok));
    } catch {
      setBadge(undefined);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onUpdate = (): void => {
      void refresh();
    };
    window.addEventListener("khora:registry-updated", onUpdate);
    return () => window.removeEventListener("khora:registry-updated", onUpdate);
  }, [refresh]);

  return badge;
}
