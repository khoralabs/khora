import {
  createNegotiationStructuredBilateralContract,
  type StructuredBilateralContractOptions,
} from "./contracts/structured-bilateral.ts";
import { ObpLedger, type ObpLedgerOptions } from "./ledger.ts";
import type { NegotiationTurnAudit } from "./runtime.ts";
import type { TurnContract } from "./turn-contract.ts";

/**
 * Allocates a ledger + structured bilateral contract pair.
 * Use {@link buildContractOptions} when {@link StructuredBilateralContractOptions.getGraphSnapshot}
 * must close over the new ledger (e.g. `ledger.completedTurns`).
 */
export function createNegotiationLedgerAndStructuredContract(
  ledgerOpts: Omit<
    ObpLedgerOptions<NegotiationTurnAudit>,
    "initialAudits" | "initialCompletedTurns"
  >,
  buildContractOptions: (
    ledger: ObpLedger<NegotiationTurnAudit>,
  ) => Omit<StructuredBilateralContractOptions, "ledger">,
): {
  ledger: ObpLedger<NegotiationTurnAudit>;
  contract: TurnContract<NegotiationTurnAudit>;
} {
  const ledger = new ObpLedger<NegotiationTurnAudit>(ledgerOpts);
  const contract = createNegotiationStructuredBilateralContract({
    ledger,
    ...buildContractOptions(ledger),
  });
  return { ledger, contract };
}
