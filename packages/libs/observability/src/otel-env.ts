export const DEFAULT_SERVICE_NAMESPACE = "khoralabs";

export function parseOtelResourceAttributes(raw: string | undefined): Record<string, string> {
  if (raw === undefined || raw.trim().length === 0) return {};

  const out: Record<string, string> = {};
  for (const part of raw.split(",")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key.length > 0 && value.length > 0) out[key] = value;
  }
  return out;
}

export function formatOtelResourceAttributes(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .map(([key, value]) => `${key}=${value}`)
    .join(",");
}

export function mergeOtelResourceAttributes(
  existing: string | undefined,
  defaults: Record<string, string>,
): string {
  return formatOtelResourceAttributes({
    ...defaults,
    ...parseOtelResourceAttributes(existing),
  });
}

/** Builds the env object passed to a spawned Bun server process, setting OTel defaults. */
export function buildOtelServerEnv(
  opts: { defaultServiceName: string },
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) out[key] = value;
  }

  if ((out.OTEL_SERVICE_NAME?.trim() ?? "").length === 0) {
    out.OTEL_SERVICE_NAME = opts.defaultServiceName;
  }

  out.OTEL_RESOURCE_ATTRIBUTES = mergeOtelResourceAttributes(out.OTEL_RESOURCE_ATTRIBUTES, {
    "service.namespace": DEFAULT_SERVICE_NAMESPACE,
  });

  return out;
}

export function buildOtelResourceAttributes(
  serviceName: string,
  serviceVersion: string,
): Record<string, string> {
  return {
    "service.namespace": DEFAULT_SERVICE_NAMESPACE,
    ...parseOtelResourceAttributes(process.env.OTEL_RESOURCE_ATTRIBUTES),
    "service.name": serviceName,
    "service.version": serviceVersion,
  };
}
