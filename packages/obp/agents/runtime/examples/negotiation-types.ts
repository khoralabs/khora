import type { GraphSnapshot } from "@cfd/obp-core";

export type BindOption = {
  portId: string;
  portType: string;
  terminal: boolean;
  description: string;
  affordanceDescription: string;
};

export type Audit =
  | {
      kind: "genesis";
      turnIndex: number;
      actingPartyId: string;
      newOfferId: string;
      newOfferType: string;
      exposedPortIds: string[];
      exposedPorts: Array<{ portType: string; description: string; terminal: boolean }>;
    }
  | {
      kind: "bind";
      turnIndex: number;
      actingPartyId: string;
      chosenPortId: string;
      chosenPortType: string;
      headOfferId: string;
      counterpartyHeadOfferType: string | null;
      bindKind: string;
      bindMenu: BindOption[];
      newOfferId: string;
      newOfferType: string;
      exposedPortIds: string[];
      exposedPorts: Array<{ portType: string; description: string; terminal: boolean }>;
      counterpartyBind?: Record<string, unknown>;
    };

export type NextTurn = {
  mode: "genesis" | "bind";
  actingPartyId: string;
  actingRole: "buyer" | "seller";
  counterpartyHeadOfferType: string | null;
  bindOptions: BindOption[];
};

export type StateResponse = {
  graph: GraphSnapshot;
  audits: Audit[];
  turnsCompleted: number;
  maxTurns: number;
  negotiationEnded: boolean;
  nextActorHint: "buyer" | "seller" | null;
  nextTurn: NextTurn | null;
  negotiationFirst: "buyer" | "seller";
  partyIds: { buyer: string; seller: string };
  walkAwayRequested: boolean;
  llmConfigured: boolean;
  agreementReached: boolean;
};

export type HealthResponse = {
  llmReady: boolean;
};
