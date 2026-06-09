export function envRelayMaxChannels(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.VELLUM_RELAY_MAX_CHANNELS?.trim();
  if (raw === undefined || raw.length === 0) return 10_000;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 10_000;
}
