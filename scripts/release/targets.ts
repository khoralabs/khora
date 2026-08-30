/** Shared release platform targets for CLI, server, and registry packaging. */

export const SUPPORTED_TARGETS = [
  { slug: "darwin-arm64", bunTarget: "bun-darwin-arm64", os: "darwin", cpu: "arm64" },
  { slug: "linux-x64", bunTarget: "bun-linux-x64", os: "linux", cpu: "x64" },
  { slug: "linux-arm64", bunTarget: "bun-linux-arm64", os: "linux", cpu: "arm64" },
] as const;

export type PlatformTarget = (typeof SUPPORTED_TARGETS)[number];

export const SUPPORTED_SLUGS: ReadonlySet<string> = new Set(SUPPORTED_TARGETS.map((t) => t.slug));
