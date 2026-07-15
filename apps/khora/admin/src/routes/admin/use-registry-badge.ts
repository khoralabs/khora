import { useCallback, useEffect, useState } from "react";

export type RegistryBadge = {
  label: string;
  variant: "default" | "secondary" | "outline" | "destructive";
};

export function badgeFromRegistryJson(
  json: Record<string, unknown>,
  resOk: boolean,
): RegistryBadge {
  if (!resOk || json.configured !== true) {
    return { label: "Unregistered", variant: "outline" };
  }
  const status = typeof json.status === "string" ? json.status : "unknown";
  if (status === "needs-registration") {
    return { label: "Unregistered", variant: "outline" };
  }
  if (status === "active") {
    return { label: "Registered", variant: "default" };
  }
  if (status === "pending" || status === "pending-token") {
    return { label: "Pending", variant: "secondary" };
  }
  if (status === "suspended") {
    return { label: "Suspended", variant: "destructive" };
  }
  return { label: "Unregistered", variant: "outline" };
}

/** Registry connection status for the Registry admin page only. */
export function useRegistryBadge(): RegistryBadge | undefined {
  const [badge, setBadge] = useState<RegistryBadge | undefined>(undefined);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/admin/api/registry");
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      setBadge(badgeFromRegistryJson(json, res.ok));
    } catch {
      setBadge({ label: "Unregistered", variant: "outline" });
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
