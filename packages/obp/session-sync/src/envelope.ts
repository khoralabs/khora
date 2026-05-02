import type { Checkpoint } from "./verify.ts";

/** Wire-shaped checkpoint proposal between peers (no transport here). */
export type SessionEnvelope = {
  session_id: string;
  from_party: string;
  base_checkpoint: Checkpoint;
  delta_ops: unknown[];
  new_checkpoint: Checkpoint;
};
