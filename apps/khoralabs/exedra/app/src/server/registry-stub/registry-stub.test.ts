import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { verifyRegistrySession } from "@khoralabs/registry-auth";
import { createRegistryEmailConfirmApi } from "@khoralabs/registry-auth/client";

import { getStubRegistryOtp } from "./config.js";
import {
  handleStubGetSession,
  handleStubSendVerificationOtp,
  handleStubSignInEmailOtp,
  handleStubSignOut,
} from "./handlers.js";
import { resetStubRegistryStore } from "./store.js";

const BASE = "http://localhost:3000";

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

async function stubFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const req = new Request(input, init);
  const path = new URL(requestUrl(input)).pathname;
  if (path === "/api/auth/email-otp/send-verification-otp") {
    return handleStubSendVerificationOtp(req);
  }
  if (path === "/api/auth/sign-in/email-otp") {
    return handleStubSignInEmailOtp(req);
  }
  if (path === "/api/auth/get-session") {
    return handleStubGetSession(req);
  }
  return Response.json({ error: "not found" }, { status: 404 });
}

describe("exedra stub registry", () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    resetStubRegistryStore();
    delete process.env.EXEDRA_STUB_REGISTRY_OTP;
    globalThis.fetch = stubFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    resetStubRegistryStore();
    delete process.env.EXEDRA_STUB_REGISTRY_OTP;
    globalThis.fetch = origFetch;
  });

  test("email OTP sign-in round-trip matches registry-auth client", async () => {
    const email = "dev@exedra.test";
    const api = createRegistryEmailConfirmApi({
      registryUrl: BASE,
    });

    const send = await api.sendOtp({ email, purpose: "sign-in" });
    expect(send.ok).toBe(true);

    const verify = await api.verifyOtp({
      email,
      otp: getStubRegistryOtp(),
      purpose: "sign-in",
    });
    expect(verify.ok).toBe(true);
    expect(verify.session?.user.email).toBe(email);
    expect(verify.session?.user.id.length).toBeGreaterThan(0);
  });

  test("verifyRegistrySession accepts stub session cookie", async () => {
    const email = "session@exedra.test";
    await handleStubSendVerificationOtp(
      new Request(`${BASE}/api/auth/email-otp/send-verification-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, type: "sign-in" }),
      }),
    );

    const signIn = await handleStubSignInEmailOtp(
      new Request(`${BASE}/api/auth/sign-in/email-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: getStubRegistryOtp() }),
      }),
    );
    expect(signIn.status).toBe(200);
    const cookie = signIn.headers.getSetCookie?.()[0]?.split(";")[0];
    expect(cookie?.startsWith("better-auth.session_token=")).toBe(true);

    const session = await verifyRegistrySession(
      new Request(`${BASE}/api/auth/get-session`, { headers: { cookie: cookie ?? "" } }),
      { registryUrl: BASE, fetchImpl: stubFetch as typeof fetch },
    );
    expect(session).not.toBeNull();
    expect(session?.user.id.length).toBeGreaterThan(0);
    expect(session?.session.id.length).toBeGreaterThan(0);
  });

  test("sign-out clears stub session cookie", async () => {
    const email = "logout@exedra.test";
    await handleStubSendVerificationOtp(
      new Request(`${BASE}/api/auth/email-otp/send-verification-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, type: "sign-in" }),
      }),
    );

    const signIn = await handleStubSignInEmailOtp(
      new Request(`${BASE}/api/auth/sign-in/email-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: getStubRegistryOtp() }),
      }),
    );
    const cookie = signIn.headers.getSetCookie?.()[0]?.split(";")[0];
    expect(cookie?.startsWith("better-auth.session_token=")).toBe(true);

    const signOut = await handleStubSignOut(
      new Request(`${BASE}/api/auth/sign-out`, {
        method: "POST",
        headers: { cookie: cookie ?? "" },
      }),
    );
    expect(signOut.status).toBe(200);
    const clearedCookie = signOut.headers.getSetCookie?.()[0] ?? "";
    expect(clearedCookie).toContain("Max-Age=0");

    const session = await verifyRegistrySession(
      new Request(`${BASE}/api/auth/get-session`, { headers: { cookie: cookie ?? "" } }),
      { registryUrl: BASE, fetchImpl: stubFetch as typeof fetch },
    );
    expect(session).toBeNull();
  });
});
