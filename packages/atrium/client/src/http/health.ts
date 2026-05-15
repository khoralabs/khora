import {
  AtriumClientError,
  type AtriumUnaryTransport,
  readErrorMessage,
} from "@khoralabs/atrium-transport";
import z from "zod";

const zHealth = z.object({ ok: z.literal(true) });

export async function health(t: AtriumUnaryTransport): Promise<{ ok: true }> {
  const res = await t.fetch("/health", { method: "GET" });
  if (!res.ok) {
    throw new AtriumClientError(await readErrorMessage(res), res.status);
  }
  const json = (await res.json()) as unknown;
  return zHealth.parse(json);
}
