import type { Composable, ToolSpec } from "./types.js";

/**
 * Hash a tool composable's static identity (bottom-up).
 */
export async function hashToolComposableStatic<
  Env,
  TOOLS extends Record<string, ToolSpec>,
>(
  composable: Composable<{ kind: string; name: string }, TOOLS, Env>,
): Promise<string> {
  if (composable.staticProps.kind !== "tool") {
    throw new Error(
      `hashToolComposableStatic: expected composable with kind "tool", got ${String(composable.staticProps.kind)}`,
    );
  }
  return composable.computeStaticHash();
}
