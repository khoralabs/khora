export { formatThrownError } from "./format-thrown-error";

export class KhoraClientError extends Error {
  readonly status: number;
  readonly bodyText?: string;

  constructor(message: string, status: number, bodyText?: string) {
    super(message);
    this.name = "KhoraClientError";
    this.status = status;
    this.bodyText = bodyText;
  }
}
