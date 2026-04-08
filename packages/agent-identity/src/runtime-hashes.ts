import {
  runtimeIdentityCanonicalPayload,
  toolSpecCanonicalPayload,
} from "./canonical-payloads.js";
import { hashPlainObject } from "./hash.js";
import type { AnyComposable, ComposableWithChildren } from "./toolkit.js";
import type { Composable, ToolkitContext, ToolSpec } from "./types.js";

/**
 * Recursively collects each leaf tool's static hash (name → hash) from a composable tree.
 */
export async function collectToolStaticHashes<
  SP extends { kind: string; name: string },
  Tools extends Record<string, ToolSpec>,
  Env = unknown,
>(root: Composable<SP, Tools, Env>): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  async function walk(c: AnyComposable): Promise<void> {
    const kind = c.staticProps.kind;
    if (kind === "tool") {
      map.set(c.staticProps.name, await c.computeStaticHash());
      return;
    }
    const children = (c as ComposableWithChildren).childComposables;
    if (children?.length) {
      for (const ch of children) {
        await walk(ch);
      }
    }
  }

  await walk(root as AnyComposable);
  return map;
}

/**
 * Resolves per-tool hashes for a runtime snapshot: static map first, else {@link hashToolSpecIdentity}.
 * Tool names are sorted lexicographically (same order as the runtime hash payload).
 */
export async function resolveRuntimeToolRefs(
  enabledToolNames: string[],
  nameToStaticHash: Map<string, string>,
  toolsFallback: Record<string, ToolSpec>,
): Promise<Array<{ toolKey: string; toolHash: string }>> {
  const sortedNames = [...enabledToolNames].sort((a, b) => a.localeCompare(b));
  const out: Array<{ toolKey: string; toolHash: string }> = [];
  for (const name of sortedNames) {
    const h = nameToStaticHash.get(name);
    if (h) {
      out.push({ toolKey: name, toolHash: h });
    } else {
      const spec = toolsFallback[name];
      if (spec) {
        out.push({
          toolKey: name,
          toolHash: await hashToolSpecIdentity(spec),
        });
      }
    }
  }
  return out;
}

/**
 * Runtime identity hash: enabled tools only, ordered by tool name.
 */
export async function computeRuntimeHash(
  enabledToolNames: string[],
  nameToStaticHash: Map<string, string>,
  toolsFallback: Record<string, ToolSpec>,
): Promise<string> {
  const refs = await resolveRuntimeToolRefs(
    enabledToolNames,
    nameToStaticHash,
    toolsFallback,
  );
  return hashPlainObject(runtimeIdentityCanonicalPayload(refs));
}

/**
 * Full pipeline: static hashes → evaluate toolkit → runtime hash + tool refs for persistence.
 */
export async function computeRuntimeIdentityFromEvaluation<
  SP extends { kind: string; name: string },
  Tools extends Record<string, ToolSpec>,
  Env = unknown,
>(
  root: Composable<SP, Tools, Env>,
  ctx: ToolkitContext<Env>,
): Promise<{
  runtimeHash: string;
  toolRefs: Array<{ toolKey: string; toolHash: string }>;
  evaluatedTools: Tools;
}> {
  const nameToStaticHash = await collectToolStaticHashes(root);
  const { tools } = await root.evaluate(ctx);
  const toolRefs = await resolveRuntimeToolRefs(
    Object.keys(tools),
    nameToStaticHash,
    tools,
  );
  const runtimeHash = await hashPlainObject(
    runtimeIdentityCanonicalPayload(toolRefs),
  );
  return { runtimeHash, toolRefs, evaluatedTools: tools };
}

/**
 * Hash a {@link ToolSpec} using the same fields as static tool identity (for dynamic-only tools).
 */
export async function hashToolSpecIdentity(spec: ToolSpec): Promise<string> {
  return hashPlainObject(toolSpecCanonicalPayload(spec));
}
