import z from "zod";
import { AtriumClientError } from "../atrium-client-error.ts";
import { type HttpTransport, readErrorMessage } from "./transport.ts";

const zHealth = z.object({ ok: z.literal(true) });

export async function health(t: HttpTransport): Promise<{ ok: true }> {
  const res = await t.fetch("/health", { method: "GET" });
  if (!res.ok) {
    throw new AtriumClientError(await readErrorMessage(res), res.status);
  }
  const json = (await res.json()) as unknown;
  return zHealth.parse(json);
}
