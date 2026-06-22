import type { TurnEmitter, TurnEvent } from "./events.js";

type RelayListener = TurnEmitter;

const listenersByThread = new Map<string, Set<RelayListener>>();

export function registerTurnRelay(threadId: string, emit: TurnEmitter): () => void {
  let listeners = listenersByThread.get(threadId);
  if (listeners === undefined) {
    listeners = new Set();
    listenersByThread.set(threadId, listeners);
  }
  listeners.add(emit);
  return () => {
    listeners?.delete(emit);
    if (listeners !== undefined && listeners.size === 0) {
      listenersByThread.delete(threadId);
    }
  };
}

export function relayTurnEvent(threadId: string, event: TurnEvent): void {
  const listeners = listenersByThread.get(threadId);
  if (listeners === undefined) return;
  for (const emit of listeners) {
    emit(event);
  }
}

export function unregisterAllTurnRelays(threadId: string): void {
  listenersByThread.delete(threadId);
}
