import { KHORA_HTTP_PATH, zKhoraErrorCode } from "@khoralabs/khora-contracts/http";
import z from "zod";
import { KhoraClientError, type KhoraUnaryTransport, readErrorEnvelope } from "../transport";

const zHealth = z.object({ ok: z.literal(true) });

export async function health(t: KhoraUnaryTransport): Promise<{ ok: true }> {
  const res = await t.fetch(KHORA_HTTP_PATH.health, { method: "GET" });
  if (!res.ok) {
    const env = await readErrorEnvelope(res);
    const code = zKhoraErrorCode.safeParse(env.code);
    throw new KhoraClientError(
      env.message,
      res.status,
      env.bodyText,
      code.success ? code.data : undefined,
    );
  }
  const json = (await res.json()) as unknown;
  return zHealth.parse(json);
}
