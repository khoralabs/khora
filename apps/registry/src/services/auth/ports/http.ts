import type { RegistryAuthHttpPort } from "@khoralabs/registry/host";
import { getRegistryAuth } from "../instance";
import { extractBetterAuthSessionCookie, formatBetterAuthSessionCookie } from "../session-cookie";

export function createBetterAuthHttpPort(opts: { publicUrl: () => string }): RegistryAuthHttpPort {
  return {
    handleAuthApi(req) {
      return getRegistryAuth().handler(req);
    },
    callAuthEndpoint(path, init) {
      const base = opts.publicUrl();
      return getRegistryAuth().handler(new Request(`${base}/api/auth${path}`, init));
    },
    formatSessionCookie: formatBetterAuthSessionCookie,
    extractSessionCookie: extractBetterAuthSessionCookie,
  };
}
