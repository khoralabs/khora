import { ObpError } from "../persistence/client/errors.ts";
import type { OBPPersistenceClient } from "../persistence/client/obp-persistence-client.ts";
import {
  applyProliferate,
  applyResolve,
  parseProliferateBody,
  parseResolveBody,
} from "./graph-effect.ts";
import type { SessionOp } from "./to-session-op.ts";
import type { SessionInit } from "./types.ts";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

export type ReplaySessionOpsHooks = {
  /**
   * Invoked for each **`terminate`** op. Live frame sessions do not mutate persistence on TERMINATE;
   * use this to map teardown to revoke helpers (e.g. **`expirePortNow`**) if desired.
   */
  onTerminate?: (reason: string, code?: string) => void;
};

/**
 * Applies one verified **`SessionOp`** to **`client`**, using the same graph effects as live frames
 * (**`applyProliferate`** / **`applyResolve`**), so **`max_bindings`**, exposure, and bind policy
 * rules match **`OBPPersistenceClient`** behavior.
 *
 * **Parties:** **`init.party_ids[0]`** and **`init.party_ids[1]`** MUST already exist in the backing
 * **`ObpPersistence`** (register before replay). **`proliferate`** uses the responder party
 * (**`party_ids[0]`**); **`resolve`** uses the initiator (**`party_ids[1]`**) — consistent with
 * **`runFrameSession`** turn rules.
 *
 * **TERMINATE:** No persistence writes by default; see **`hooks.onTerminate`**.
 */
export function applySessionOp(
  client: OBPPersistenceClient,
  init: SessionInit,
  op: SessionOp,
  hooks?: ReplaySessionOpsHooks,
): void {
  switch (op.kind) {
    case "proliferate": {
      if (!isRecord(op.payload)) {
        throw new ObpError("VALIDATION", "proliferate payload must be a JSON object");
      }
      const body = parseProliferateBody(op.payload);
      const responderPartyId = init.party_ids[0];
      if (responderPartyId === undefined) {
        throw new ObpError("VALIDATION", "init.party_ids must have two entries");
      }
      applyProliferate(client, responderPartyId, body);
      return;
    }
    case "resolve": {
      if (!isRecord(op.payload)) {
        throw new ObpError("VALIDATION", "resolve payload must be a JSON object");
      }
      const body = parseResolveBody(op.payload);
      const initiatorPartyId = init.party_ids[1];
      if (initiatorPartyId === undefined) {
        throw new ObpError("VALIDATION", "init.party_ids must have two entries");
      }
      applyResolve(client, initiatorPartyId, body);
      return;
    }
    case "terminate": {
      if (!isRecord(op.payload)) {
        throw new ObpError("VALIDATION", "terminate payload must be a JSON object");
      }
      const reason = String(op.payload.reason ?? "");
      const code =
        op.payload.code !== undefined && op.payload.code !== null
          ? String(op.payload.code)
          : undefined;
      hooks?.onTerminate?.(reason, code);
      return;
    }
    default:
      throw new ObpError("VALIDATION", `unknown SessionOp kind: ${String(op.kind)}`);
  }
}

/**
 * Applies **`ops`** in order. Call after **`verifyExtends`** (or equivalent) if committing remote deltas.
 */
export function applySessionOps(
  client: OBPPersistenceClient,
  init: SessionInit,
  ops: SessionOp[],
  hooks?: ReplaySessionOpsHooks,
): void {
  for (const op of ops) {
    applySessionOp(client, init, op, hooks);
  }
}
