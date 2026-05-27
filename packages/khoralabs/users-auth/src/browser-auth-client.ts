import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export function createUsersAuthClient(opts: { registryUrl: string }) {
  const baseURL = opts.registryUrl.replace(/\/$/, "");
  return createAuthClient({
    baseURL,
    basePath: "/api/auth",
    fetchOptions: { credentials: "include" },
    plugins: [emailOTPClient()],
  });
}
