export class At2ClientError extends Error {
  readonly status: number;
  readonly bodyText?: string;

  constructor(message: string, status: number, bodyText?: string) {
    super(message);
    this.name = "At2ClientError";
    this.status = status;
    this.bodyText = bodyText;
  }
}
