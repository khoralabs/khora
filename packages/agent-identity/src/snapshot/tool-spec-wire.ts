import type { ToolIdentityCanonicalPayload } from "../hashing/canonical-payloads.js";
import { hashPlainObject, schemaToHashInput } from "../hashing/hash.js";
import type { ToolSpec } from "../tool/types.js";
import type { ToolSpecWire } from "./types.js";

/**
 * Strips handlers; stores {@link schemaToHashInput} for the schema (hash-stable, interchange-friendly).
 */
export function toolSpecToWire(spec: ToolSpec): ToolSpecWire {
  const policyIds = [...(spec.policyIds ?? [])].sort((a, b) => a.localeCompare(b));
  return {
    name: spec.name,
    description: spec.description ?? "",
    instructions: spec.instructions,
    inputSchema: schemaToHashInput(spec.inputSchema),
    policyIds,
  };
}

/**
 * Canonical tool payload from wire (matches {@link toolSpecCanonicalPayload} when wire came from {@link toolSpecToWire}).
 */
export function toolIdentityPayloadFromWire(wire: ToolSpecWire): ToolIdentityCanonicalPayload {
  const instructionLines = wire.instructions ? wire.instructions.split("\n\n") : [];
  return {
    kind: "tool",
    name: wire.name,
    description: wire.description === "" ? null : wire.description,
    schema: wire.inputSchema,
    instructions: [...instructionLines].sort((a, b) => a.localeCompare(b)),
    policies: [...wire.policyIds].sort((a, b) => a.localeCompare(b)),
  };
}

/**
 * SHA-256 hex of {@link toolIdentityPayloadFromWire} (same digest as {@link hashToolSpecIdentity} for an equivalent live {@link ToolSpec}).
 */
export async function hashToolSpecWire(wire: ToolSpecWire): Promise<string> {
  return hashPlainObject(toolIdentityPayloadFromWire(wire));
}
