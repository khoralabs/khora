import { createUsersAuthClient } from "@khoralabs/registry-auth/client";

function registryUrl(): string {
  if (typeof window !== "undefined") {
    const fromEnv = import.meta.env.BUN_PUBLIC_KHORA_REGISTRY_URL as string | undefined;
    if (fromEnv !== undefined && fromEnv.length > 0) {
      return fromEnv.replace(/\/$/, "");
    }
  }
  return "http://localhost:4000";
}

export const authClient = createUsersAuthClient({ registryUrl: registryUrl() });
