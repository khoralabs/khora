import type { ObpClient, ObpPersistence } from "@cfd/obp-core";

/**
 * Shared negotiation truth: one ledger per conversation / deal / channel.
 *
 * Owns the {@link ObpClient} + {@link ObpPersistence} pair, the ledger sequence callback,
 * the turn counter, and the audit tail. Per-agent {@link TurnContract}s read and
 * write through this ledger; the {@link BilateralCoordinator} (or any other
 * coordinator) sequences turns against it.
 *
 * The ledger does **not** mutate the OBP graph itself — contracts do. It only
 * tracks the bookkeeping needed to drive a negotiation forward.
 */
export type ObpLedgerOptions<TAudit> = {
  client: ObpClient;
  persistence: ObpPersistence;
  ledgerSeq: () => number;
  /** Max number of completed turns this ledger will accept; coordinators check before running. */
  maxTurns: number;
  /** Optional pre-seeded audit tail (e.g. for resumed sessions). */
  initialAudits?: readonly TAudit[];
  /** Optional initial completed-turn count (defaults to {@code initialAudits.length}). */
  initialCompletedTurns?: number;
};

export class ObpLedger<TAudit> {
  readonly client: ObpClient;
  readonly persistence: ObpPersistence;
  readonly ledgerSeq: () => number;
  readonly maxTurns: number;
  private readonly auditList: TAudit[];
  private completed: number;

  constructor(opts: ObpLedgerOptions<TAudit>) {
    this.client = opts.client;
    this.persistence = opts.persistence;
    this.ledgerSeq = opts.ledgerSeq;
    this.maxTurns = opts.maxTurns;
    this.auditList = [...(opts.initialAudits ?? [])];
    this.completed = opts.initialCompletedTurns ?? this.auditList.length;
  }

  /** Number of successfully applied turns. */
  get completedTurns(): number {
    return this.completed;
  }

  /** Read-only view of the audit tail (oldest first). */
  get audits(): readonly TAudit[] {
    return this.auditList;
  }

  /** Most recent audit entry, or undefined when empty. */
  lastAudit(): TAudit | undefined {
    return this.auditList[this.auditList.length - 1];
  }

  /** Whether the ledger is at its turn budget. Coordinators consult this before scheduling. */
  isExhausted(): boolean {
    return this.completed >= this.maxTurns;
  }

  /**
   * Records an applied turn and bumps the completed-turn counter atomically.
   * Contracts call this from inside their {@code apply} after writing to the graph.
   */
  recordAudit(audit: TAudit): void {
    this.auditList.push(audit);
    this.completed += 1;
  }
}
