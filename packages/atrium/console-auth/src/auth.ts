import { createAuthInstance } from "./auth-config.ts";

let authInstance: ReturnType<typeof createAuthInstance> | undefined;

export function getAuth(): ReturnType<typeof createAuthInstance> {
  authInstance ??= createAuthInstance();
  return authInstance;
}

type AuthInstance = ReturnType<typeof createAuthInstance>;

/** Lazy proxy so env is read after the app preloads `.env`. */
export const auth: AuthInstance = new Proxy({} as AuthInstance, {
  get(_target, prop) {
    const instance = getAuth() as Record<string | symbol, unknown>;
    const value = instance[prop];
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(instance);
    }
    return value;
  },
});
