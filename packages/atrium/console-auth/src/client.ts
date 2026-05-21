import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

function clientBaseUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.location.origin;
}

export const authClient = createAuthClient({
  baseURL: clientBaseUrl(),
  basePath: "/api/auth",
  fetchOptions: { credentials: "include" },
  plugins: [emailOTPClient()],
});
