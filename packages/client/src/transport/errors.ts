export { formatThrownError } from "./format-thrown-error";

import type { KhoraErrorCode } from "@khoralabs/khora-contracts/http";

export class KhoraClientError extends Error {
  readonly status: number;
  readonly code?: KhoraErrorCode;
  readonly bodyText?: string;

  constructor(message: string, status: number, bodyText?: string, code?: KhoraErrorCode) {
    super(message);
    this.name = "KhoraClientError";
    this.status = status;
    this.bodyText = bodyText;
    if (code !== undefined) this.code = code;
  }
}
