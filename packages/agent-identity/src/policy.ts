import type { SharedPolicy } from "./types.js";

export function policy<Env>(
  id: string,
  evaluate: (env: Env) => Promise<boolean>,
): SharedPolicy {
  return {
    id,
    evaluate: (env) => evaluate(env as Env),
  };
}
