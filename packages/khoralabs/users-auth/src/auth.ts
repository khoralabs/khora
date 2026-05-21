import { createRegistryAuth } from "./auth-config";

let authInstance: ReturnType<typeof createRegistryAuth> | undefined;

export function getRegistryAuth(): ReturnType<typeof createRegistryAuth> {
  authInstance ??= createRegistryAuth();
  return authInstance;
}

type AuthInstance = ReturnType<typeof createRegistryAuth>;

/** Lazy proxy so env is read after the app preloads `.env`. */
export const registryAuth: AuthInstance = new Proxy({} as AuthInstance, {
  get(_target, prop) {
    const instance = getRegistryAuth() as Record<string | symbol, unknown>;
    const value = instance[prop];
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(instance);
    }
    return value;
  },
});
