import { KHORA_HTTP_PATH } from "@khoralabs/khora-contracts/http";
import z from "zod";
import { KhoraClientError, type KhoraUnaryTransport, readErrorMessage } from "../transport";

const zHealth = z.object({ ok: z.literal(true) });

export async function health(t: KhoraUnaryTransport): Promise<{ ok: true }> {
  const res = await t.fetch(KHORA_HTTP_PATH.health, { method: "GET" });
  if (!res.ok) {
    throw new KhoraClientError(await readErrorMessage(res), res.status);
  }
  const json = (await res.json()) as unknown;
  return zHealth.parse(json);
}
