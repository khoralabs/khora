import type { ObpLedger } from "../ledger.ts";
import type { PreparedTurn, TurnContract } from "../turn-contract.ts";

/**
 * Adapter from a {@link PreparedTurn} to raw agent output. Hosts implement this
 * by invoking whichever agent runner they prefer ({@code AgentRegistry} session,
 * direct {@code generateObject}, a tool-loop driver, etc.).
 */
export type RunAgentTurn = (args: {
  partyId: string;
  prepared: PreparedTurn<unknown>;
}) => Promise<unknown>;

export type BilateralCoordinatorOptions<TAudit> = {
  ledger: ObpLedger<TAudit>;
  parties: readonly [string, string];
  contract: TurnContract<TAudit>;
  runAgentTurn: RunAgentTurn;
  /** Party that acts on completed-turn 0; defaults to {@code parties[0]}. */
  firstPartyId?: string;
};

export type RunNextTurnResult<TAudit> =
  | { ok: true; partyId: string; audit: TAudit }
  | { ok: false; error: string };

/**
 * Two-party turn alternation: picks the acting party from
 * {@link ObpLedger.completedTurns}, builds a per-turn view via the
 * {@link TurnContract}, hands it to {@link RunAgentTurn}, then atomically applies
 * the result back through the contract.
 *
 * Bilateral is the reference implementation; coordinators with different
 * scheduling rules (e.g. parallel proposals, leader election) replace this class
 * while reusing the same {@link TurnContract} interface.
 */
export class BilateralCoordinator<TAudit> {
  readonly ledger: ObpLedger<TAudit>;
  readonly parties: readonly [string, string];
  readonly contract: TurnContract<TAudit>;
  readonly runAgentTurn: RunAgentTurn;
  readonly firstPartyId: string;

  constructor(opts: BilateralCoordinatorOptions<TAudit>) {
    if (!opts.parties.includes(opts.firstPartyId ?? opts.parties[0])) {
      throw new RangeError("BilateralCoordinator: firstPartyId must be one of `parties`");
    }
    this.ledger = opts.ledger;
    this.parties = opts.parties;
    this.contract = opts.contract;
    this.runAgentTurn = opts.runAgentTurn;
    this.firstPartyId = opts.firstPartyId ?? opts.parties[0];
  }

  /** Party id that may act after {@code ledger.completedTurns} turns are complete. */
  expectedActingPartyId(): string {
    const second = this.parties[0] === this.firstPartyId ? this.parties[1] : this.parties[0];
    return this.ledger.completedTurns % 2 === 0 ? this.firstPartyId : second;
  }

  /**
   * Runs one turn for {@link expectedActingPartyId}. Returns the applied audit
   * on success, or a structured error string if the agent runner or contract
   * rejected. Errors do not advance the turn counter.
   */
  async runNextTurn(): Promise<RunNextTurnResult<TAudit>> {
    if (this.ledger.isExhausted()) {
      return { ok: false, error: "max_turns" };
    }
    const partyId = this.expectedActingPartyId();
    let prepared: PreparedTurn<unknown>;
    try {
      prepared = await this.contract.prepare(partyId);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }

    let raw: unknown;
    try {
      raw = await this.runAgentTurn({ partyId, prepared });
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }

    try {
      const audit = await this.contract.apply(partyId, raw);
      return { ok: true, partyId, audit };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
