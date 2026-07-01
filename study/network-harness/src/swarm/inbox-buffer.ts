import type { KhoraClientEvent } from "@khoralabs/khora-client";

export type InboxEntry = {
  id: string;
  did: string;
  event: KhoraClientEvent;
  receivedAtMs: number;
};

export class InboxBuffer {
  readonly #entries = new Map<string, InboxEntry[]>();

  push(did: string, event: KhoraClientEvent): InboxEntry {
    const entry: InboxEntry = {
      id: crypto.randomUUID(),
      did,
      event,
      receivedAtMs: Date.now(),
    };
    const list = this.#entries.get(did) ?? [];
    list.push(entry);
    this.#entries.set(did, list);
    return entry;
  }

  forAgent(did: string): InboxEntry[] {
    return [...(this.#entries.get(did) ?? [])];
  }

  sinceLastTurn(did: string, afterEntryId?: string): InboxEntry[] {
    const entries = this.forAgent(did);
    if (afterEntryId === undefined) return entries;
    const index = entries.findIndex((entry) => entry.id === afterEntryId);
    if (index === -1) return entries;
    return entries.slice(index + 1);
  }
}
