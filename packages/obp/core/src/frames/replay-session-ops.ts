import { ObpError } from "../persistence/client/errors.ts";
import type { OBPPersistenceClient } from "../persistence/client/obp-persistence-client.ts";
import { applyTurn, parseTurnBody } from "./graph-effect.ts";
import type { SessionOp } from "./to-session-op.ts";
import type { SessionInit } from "./types.ts";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

function partyIdForActor(init: SessionInit, actor: string): string {
  const p = init.parties.find((x) => x.pubkey === actor);
  if (p === undefined) throw new ObpError("VALIDATION", `unknown actor ${actor}`);
  return p.id;
}

export type ReplaySessionOpsHooks = {
  /**
   * Invoked for each **`terminate`** op. Live frame sessions do not mutate persistence on TERMINATE;
   * use this to map teardown to revoke helpers (e.g. **`expirePortNow`**) if desired.
   */
  onTerminate?: (reason: string, code?: string) => void;
};

/**
 * Applies one verified **`SessionOp`** to **`client`**, using the same graph effects as live frames
 * (**`applyTurn`**), so **`max_bindings`**, exposure, and bind policy
 * rules match **`OBPPersistenceClient`** behavior.
 *
 * **`turn`:** **`payload.actor`** is the frame signer; **`payload`** otherwise matches **TurnBody** fields.
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
    case "turn": {
      if (!isRecord(op.payload)) {
        throw new ObpError("VALIDATION", "turn payload must be a JSON object");
      }
      const actor = String(op.payload.actor ?? "");
      const rest = { ...op.payload };
      delete rest.actor;
      const body = parseTurnBody(rest);
      void applyTurn(client, partyIdForActor(init, actor), body);
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

/**
 * Replays multiplex session ops: each op must carry **`session_id`** matching an entry in **`initBySessionId`**.
 */
export function applySessionOpsMultiplex(
  client: OBPPersistenceClient,
  initBySessionId: Map<string, SessionInit>,
  ops: SessionOp[],
  hooks?: ReplaySessionOpsHooks,
): void {
  for (const op of ops) {
    const sid = op.session_id;
    if (sid === undefined || sid === "") {
      throw new ObpError("VALIDATION", "multiplex replay requires session_id on each op");
    }
    const init = initBySessionId.get(sid);
    if (init === undefined) {
      throw new ObpError("VALIDATION", `unknown session_id for multiplex replay: ${sid}`);
    }
    applySessionOp(client, init, { kind: op.kind, payload: op.payload }, hooks);
  }
}
