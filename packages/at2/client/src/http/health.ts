import {
  At2ClientError,
  type At2UnaryTransport,
  readErrorMessage,
} from "@khoralabs/at2-transport";
import z from "zod";

const zHealth = z.object({ ok: z.literal(true) });

export async function health(t: At2UnaryTransport): Promise<{ ok: true }> {
  const res = await t.fetch("/health", { method: "GET" });
  if (!res.ok) {
    throw new At2ClientError(await readErrorMessage(res), res.status);
  }
  const json = (await res.json()) as unknown;
  return zHealth.parse(json);
}
