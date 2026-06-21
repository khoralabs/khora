import { isAgentSessionAbortedError } from "@khoralabs/agent-capabilities";

export class TurnAbortedError extends Error {
  constructor(message = "Turn aborted") {
    super(message);
    this.name = "TurnAbortedError";
  }
}

export function isTurnAbortedError(err: unknown): err is TurnAbortedError {
  return err instanceof TurnAbortedError;
}

/** Turn-engine boundary: explicit turn abort or registry session cancellation. */
export function isAbortError(err: unknown): boolean {
  return isTurnAbortedError(err) || isAgentSessionAbortedError(err);
}
