function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function mergePluginMaps(
  layers: ReadonlyArray<Record<string, unknown>>,
): Record<string, unknown> | undefined {
  if (layers.length === 0) return undefined;
  const ids = new Set<string>();
  for (const layer of layers) for (const id of Object.keys(layer)) ids.add(id);
  const out: Record<string, unknown> = {};
  for (const id of ids) {
    let last: unknown;
    let seen = false;
    for (const layer of layers) {
      if (id in layer && layer[id] !== undefined) {
        last = layer[id];
        seen = true;
      }
    }
    if (!seen) continue;
    if (last === false) continue;
    out[id] = last;
  }
  return out;
}

/**
 * Merge config layers left-to-right with **last-wins** semantics on defined values.
 *
 * - Scalars (string / number / boolean / array): last layer that defines the key wins.
 * - `plugins`: per-id last-wins; setting an id to `false` cancels prior layers for that id.
 * - Non-plugin objects / arrays: shallow last-wins (no deep merge).
 *
 * Operates on `unknown` so it can run before validation (during `extends` chaining) and after.
 */
export function mergeAt2AppConfigLayers(
  layers: ReadonlyArray<unknown>,
): Record<string, unknown> {
  const objs: Array<Record<string, unknown>> = [];
  for (const l of layers) {
    if (l === undefined || l === null) continue;
    if (!isPlainObject(l)) continue;
    objs.push(l);
  }
  const out: Record<string, unknown> = {};
  const allKeys = new Set<string>();
  for (const o of objs) for (const k of Object.keys(o)) allKeys.add(k);
  for (const k of allKeys) {
    if (k === "plugins") {
      const pluginLayers: Array<Record<string, unknown>> = [];
      for (const o of objs) {
        const v = o.plugins;
        if (isPlainObject(v)) pluginLayers.push(v);
      }
      const merged = mergePluginMaps(pluginLayers);
      if (merged !== undefined && Object.keys(merged).length > 0) out.plugins = merged;
      continue;
    }
    let last: unknown;
    let seen = false;
    for (const o of objs) {
      if (k in o && o[k] !== undefined) {
        last = o[k];
        seen = true;
      }
    }
    if (seen) out[k] = last;
  }
  return out;
}
