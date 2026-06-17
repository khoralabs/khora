export class TurnAbortedError extends Error {
  constructor(message = "Turn aborted") {
    super(message);
    this.name = "TurnAbortedError";
  }
}

export function isTurnAbortedError(err: unknown): err is TurnAbortedError {
  return err instanceof TurnAbortedError;
}
