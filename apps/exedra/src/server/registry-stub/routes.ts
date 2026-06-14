import { isExedraStubRegistryEnabled } from "./config.js";
import {
  handleStubGetSession,
  handleStubSendVerificationOtp,
  handleStubSignInEmailOtp,
} from "./handlers.js";

function stubNotFound(): Response {
  return Response.json({ error: "Not found" }, { status: 404 });
}

function whenStubEnabled(
  handler: (req: Request) => Response | Promise<Response>,
): (req: Request) => Response | Promise<Response> {
  return (req) => (isExedraStubRegistryEnabled() ? handler(req) : stubNotFound());
}

/** Always registered so Bun route types stay stable; handlers no-op when stub is disabled. */
export const stubRegistryAuthRoutes = {
  "/api/auth/email-otp/send-verification-otp": {
    POST: whenStubEnabled(handleStubSendVerificationOtp),
  },
  "/api/auth/sign-in/email-otp": {
    POST: whenStubEnabled(handleStubSignInEmailOtp),
  },
  "/api/auth/get-session": {
    GET: whenStubEnabled(handleStubGetSession),
  },
} as const;
