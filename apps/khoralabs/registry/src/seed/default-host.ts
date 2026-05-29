import type { Database } from "bun:sqlite";
import { activateKhoraHost, registerKhoraHost } from "@khoralabs/users";

function devAutoActivateEnabled(): boolean {
  const explicit = process.env.REGISTRY_DEV_AUTO_ACTIVATE_HOST?.trim();
  if (explicit === "1" || explicit === "true") return true;
  if (explicit === "0" || explicit === "false") return false;
  return process.env.NODE_ENV !== "production";
}

export function seedDefaultHostFromEnv(db: Database): void {
  const slug = process.env.REGISTRY_DEFAULT_HOST_SLUG?.trim() || "khora-local";
  const baseUrl =
    process.env.REGISTRY_DEFAULT_HOST_URL?.trim() ||
    process.env.KHORA_BASE_URL?.trim() ||
    "http://localhost:8788";

  const host = registerKhoraHost(db, { slug, baseUrl });
  if (devAutoActivateEnabled() && host.status === "pending") {
    activateKhoraHost(db, host.id);
  }
}

export function defaultHostSlug(): string {
  return process.env.REGISTRY_DEFAULT_HOST_SLUG?.trim() || "khora-local";
}
