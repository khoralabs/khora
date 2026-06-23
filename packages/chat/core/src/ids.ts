import type { ScopeRef } from "./types.ts";

export function createId(): string {
  return crypto.randomUUID();
}

export function scopeKey(scope: { type: string; id: string }): string {
  return `${scope.type}:${scope.id}`;
}

export function scopeRefFromKey(key: string): ScopeRef {
  const separatorIndex = key.indexOf(":");
  if (separatorIndex === -1) {
    throw new Error(`Invalid scope key: ${key}`);
  }
  return {
    type: key.slice(0, separatorIndex),
    id: key.slice(separatorIndex + 1),
  };
}
