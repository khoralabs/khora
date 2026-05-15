export class AtriumClientError extends Error {
  readonly status: number;
  readonly bodyText?: string;

  constructor(message: string, status: number, bodyText?: string) {
    super(message);
    this.name = "AtriumClientError";
    this.status = status;
    this.bodyText = bodyText;
  }
}
