import type { Database } from "bun:sqlite";
import {
  type EffectiveKhoraHostSpec,
  type KhoraHostSpec,
  type KhoraHostSpecPatch,
  zKhoraHostSpec,
} from "@khoralabs/khora-contracts";
import type { KhoraHostSpecPort } from "../../ports";
import { NAMESPACE_HOST_SPEC } from "../core/id-conventions";
import { ProjectionStore } from "./projection-store";

const HOST_SPEC_ENTRY_KEY = "self";

function envHostSlug(): string | undefined {
  const slug = process.env.KHORA_HOST_SLUG?.trim();
  return slug !== undefined && slug.length > 0 ? slug : undefined;
}

function envRegistryUrl(): string | undefined {
  const url = process.env.KHORA_REGISTRY_URL?.trim();
  return url !== undefined && url.length > 0 ? url.replace(/\/$/, "") : undefined;
}

function envHostDisplayName(): string | undefined {
  const name = process.env.KHORA_HOST_DISPLAY_NAME?.trim();
  return name !== undefined && name.length > 0 ? name : undefined;
}

function envPopulationLimit(): number | undefined {
  const raw = process.env.KHORA_POPULATION_LIMIT?.trim();
  if (raw === undefined || raw.length === 0) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function envPort(): number {
  const raw = process.env.PORT?.trim();
  if (raw === undefined || raw.length === 0) return 8788;
  const p = Number(raw);
  return Number.isFinite(p) && p > 0 ? Math.floor(p) : 8788;
}

function envPublicBaseUrl(port: number): string {
  const fromEnv = process.env.KHORA_PUBLIC_BASE_URL?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return fromEnv.replace(/\/$/, "");
  }
  return `http://127.0.0.1:${port}`;
}

function parseStored(projection: unknown): KhoraHostSpec | null {
  if (projection === null || typeof projection !== "object") {
    return null;
  }
  const parsed = zKhoraHostSpec.safeParse(projection);
  return parsed.success ? parsed.data : null;
}

export function createKhoraHostSpecPort(deps: {
  hostDb: Database;
  tenantKey: string;
}): KhoraHostSpecPort {
  const store = new ProjectionStore(deps.hostDb);

  function readStored(): KhoraHostSpec | null {
    const { found, projection } = store.lookupProjection(
      deps.tenantKey,
      NAMESPACE_HOST_SPEC,
      HOST_SPEC_ENTRY_KEY,
    );
    if (!found) {
      return null;
    }
    return parseStored(projection);
  }

  function write(spec: KhoraHostSpec): KhoraHostSpec {
    const next: KhoraHostSpec = { ...spec, updatedAtMs: Date.now() };
    store.upsert({
      tenant_key: deps.tenantKey,
      namespace: NAMESPACE_HOST_SPEC,
      entry_key: HOST_SPEC_ENTRY_KEY,
      projection: next,
      updated_at_ms: next.updatedAtMs,
    });
    return next;
  }

  return {
    read(): KhoraHostSpec | null {
      return readStored();
    },

    readEffective(): EffectiveKhoraHostSpec {
      const stored = readStored() ?? {};
      return {
        registryUrl: envRegistryUrl() ?? stored.registryUrl ?? "http://localhost:4000",
        slug: envHostSlug() ?? stored.slug,
        publicBaseUrl: stored.publicBaseUrl ?? envPublicBaseUrl(envPort()),
        displayName: envHostDisplayName() ?? stored.displayName,
        populationLimit: envPopulationLimit() ?? stored.populationLimit,
        registrationSecret: stored.registrationSecret,
        managementToken: stored.managementToken,
      };
    },

    patch(patch: KhoraHostSpecPatch): KhoraHostSpec {
      const current = readStored() ?? {};
      const next: KhoraHostSpec = {
        ...current,
        ...(patch.registryUrl !== undefined ? { registryUrl: patch.registryUrl } : {}),
        ...(patch.slug !== undefined ? { slug: patch.slug } : {}),
        ...(patch.publicBaseUrl !== undefined ? { publicBaseUrl: patch.publicBaseUrl } : {}),
        ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
      };
      if (patch.populationLimit === null) {
        delete next.populationLimit;
      } else if (patch.populationLimit !== undefined) {
        next.populationLimit = patch.populationLimit;
      }
      return write(next);
    },

    storeSecrets(secrets: {
      registrationSecret?: string;
      managementToken?: string;
    }): KhoraHostSpec {
      const current = readStored() ?? {};
      const next: KhoraHostSpec = {
        ...current,
        ...(secrets.registrationSecret !== undefined
          ? { registrationSecret: secrets.registrationSecret }
          : {}),
        ...(secrets.managementToken !== undefined
          ? { managementToken: secrets.managementToken }
          : {}),
      };
      if (secrets.managementToken !== undefined) {
        delete next.registrationSecret;
      }
      return write(next);
    },

    clearRegistrationSecret(): KhoraHostSpec {
      const current = readStored() ?? {};
      const next = { ...current };
      delete next.registrationSecret;
      return write(next);
    },
  };
}
