import type {
  ChannelAdmissionRecord,
  FrameRelayStoreStrategy,
  RelayedFrameRecord,
} from "./store-types";

/** Minimal in-memory {@link FrameRelayStoreStrategy} for tests and local daemons. */
export class InMemoryFrameRelayStoreStrategy implements FrameRelayStoreStrategy {
  private admissions = new Map<string, ChannelAdmissionRecord>();
  private frames = new Map<string, RelayedFrameRecord[]>();
  private seq = 0;

  upsertChannelAdmission(record: ChannelAdmissionRecord): void {
    this.admissions.set(record.channelId, record);
  }

  getPairingSecretIfActive(channelId: string, nowMs: number): string | undefined {
    const row = this.admissions.get(channelId);
    if (row === undefined || row.expiresAtMs <= nowMs) {
      return undefined;
    }
    return row.pairingSecretHex;
  }

  enqueueRelayedFrame(channelId: string, bytes: Uint8Array): number {
    const id = ++this.seq;
    let queue = this.frames.get(channelId);
    if (queue === undefined) {
      queue = [];
      this.frames.set(channelId, queue);
    }
    queue.push({ id, bytes });
    return id;
  }

  listRelayedFramesAfter(channelId: string, afterId: number): RelayedFrameRecord[] {
    const queue = this.frames.get(channelId);
    if (queue === undefined) {
      return [];
    }
    return queue.filter((row) => row.id > afterId);
  }

  purgeRelayedFramesForChannel(channelId: string): void {
    this.frames.delete(channelId);
  }

  deleteChannelAdmission(channelId: string): void {
    this.admissions.delete(channelId);
  }
}
