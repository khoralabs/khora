/** Domain / validation failures from {@link ObpClient} or persistence. */

export type ObpErrorCode =
  | "NOT_FOUND"
  | "REF_CYCLE"
  | "REF_MISSING"
  | "NOT_EXPOSED"
  | "EXPIRED"
  | "MAX_BINDINGS"
  | "VALIDATION";

export class ObpError extends Error {
  readonly code: ObpErrorCode;

  constructor(code: ObpErrorCode, message: string) {
    super(message);
    this.name = "ObpError";
    this.code = code;
  }
}
