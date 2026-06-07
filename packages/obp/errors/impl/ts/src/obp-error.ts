/** Domain / validation failures from OBP persistence, stores, and frame sessions. */

export type ObpErrorCode =
  | "NOT_FOUND"
  | "REF_CYCLE"
  | "REF_MISSING"
  | "NOT_EXPOSED"
  | "EXPIRED"
  | "MAX_BINDINGS"
  | "VALIDATION"
  | "CAUSAL_MISMATCH"
  | "BAD_SIG"
  | "BAD_TURN"
  | "TERMINATED";

export class ObpError extends Error {
  readonly code: ObpErrorCode;

  constructor(code: ObpErrorCode, message: string) {
    super(message);
    this.name = "ObpError";
    this.code = code;
  }
}
