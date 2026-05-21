import type { Database } from "bun:sqlite";
import { seedDefaultHost } from "@khoralabs/users";

export function seedDefaultHostFromEnv(db: Database): void {
  const slug = process.env.REGISTRY_DEFAULT_HOST_SLUG?.trim() || "khora-local";
  const baseUrl =
    process.env.REGISTRY_DEFAULT_HOST_URL?.trim() ||
    process.env.ATRIUM_BASE_URL?.trim() ||
    "http://localhost:8788";
  seedDefaultHost(db, { slug, baseUrl });
}

export function defaultHostSlug(): string {
  return process.env.REGISTRY_DEFAULT_HOST_SLUG?.trim() || "khora-local";
}
