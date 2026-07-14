/** Default max chunks buffered per read side before the stream closes (DoS bound). */
export const DEFAULT_MAX_INBOUND_QUEUE_DEPTH = 256;

export type InboundSide = { q: Uint8Array[]; w: Array<() => void> };

export function wakeInboundWaiters(side: InboundSide): void {
  for (const f of side.w.splice(0)) {
    f();
  }
}

/**
 * Push one chunk onto an inbound queue. Returns false and invokes `onOverflow` when at capacity.
 */
export function enqueueInbound(
  side: InboundSide,
  bytes: Uint8Array,
  maxDepth: number,
  onOverflow: () => void,
): boolean {
  if (side.q.length >= maxDepth) {
    onOverflow();
    return false;
  }
  side.q.push(bytes);
  wakeInboundWaiters(side);
  return true;
}
