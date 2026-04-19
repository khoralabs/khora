import type { Database } from "bun:sqlite";
import { parsePriceFromType } from "@cfd/obp-tools";
import { parsePublicText, parseTermMonthsFromType } from "./encoding.ts";

export type PartyRow = {
  id: string;
  name: string;
  ts_created: number;
};

export type OfferRow = {
  offerId: string;
  partyId: string;
  type: string;
  ts_expired: number;
};

export type PortRow = {
  portId: string;
  offerId: string;
  type: string;
  terminal: boolean;
  max_bindings: number;
};

export type BindRow = {
  offerId: string;
  portId: string;
};

export type GraphSnapshot = {
  parties: PartyRow[];
  offers: OfferRow[];
  ports: PortRow[];
  binds: BindRow[];
};

export function loadGraphSnapshot(db: Database): GraphSnapshot {
  const parties = db
    .query<{ id: string; name: string; ts_created: number }, []>(
      `SELECT id, name, ts_created FROM obp_parties ORDER BY ts_created`,
    )
    .all();

  const offers = db
    .query<{ offer_id: string; party_id: string; type: string; ts_expired: number }, []>(
      `SELECT o.id AS offer_id, e.party_id, o.type, o.ts_expired
       FROM obp_offers o
       JOIN obp_extends e ON e.offer_id = o.id
       ORDER BY o.ts_created`,
    )
    .all()
    .map((r) => ({
      offerId: r.offer_id,
      partyId: r.party_id,
      type: r.type,
      ts_expired: r.ts_expired,
    }));

  const ports = db
    .query<
      { port_id: string; offer_id: string; type: string; terminal: number; max_bindings: number },
      []
    >(
      `SELECT p.id AS port_id, x.offer_id, p.type, p.terminal, p.max_bindings
       FROM obp_ports p
       JOIN obp_exposes x ON x.port_id = p.id
       ORDER BY p.ts_created`,
    )
    .all()
    .map((r) => ({
      portId: r.port_id,
      offerId: r.offer_id,
      type: r.type,
      terminal: r.terminal !== 0,
      max_bindings: r.max_bindings,
    }));

  const binds = db
    .query<{ offer_id: string; port_id: string }, []>(`SELECT offer_id, port_id FROM obp_binds`)
    .all()
    .map((r) => ({ offerId: r.offer_id, portId: r.port_id }));

  return { parties, offers, ports, binds };
}

export function formatSnapshotForPrompt(snapshot: GraphSnapshot): string {
  const lines: string[] = ["=== OBP graph (persisted only) ==="];

  lines.push("Parties:");
  for (const p of snapshot.parties) {
    lines.push(`  - ${p.id}  name=${JSON.stringify(p.name)}`);
  }

  lines.push("Offers (EXTEND from party):");
  for (const o of snapshot.offers) {
    const price = parsePriceFromType(o.type);
    const term = parseTermMonthsFromType(o.type);
    const extra =
      price !== null
        ? `  decoded_price=${price}${term !== null ? `  decoded_term_months=${term}` : ""}`
        : "";
    const txt = parsePublicText(o.type);
    const textra = txt ? `  decoded_text=${JSON.stringify(txt)}` : "";
    lines.push(
      `  - offer ${o.offerId}  party=${o.partyId}  type=${JSON.stringify(o.type)}${extra}${textra ? `\n    ${textra}` : ""}`,
    );
  }

  lines.push("Ports (EXPOSE on offer; terminal=commitment surface):");
  for (const p of snapshot.ports) {
    const price = parsePriceFromType(p.type);
    const term = parseTermMonthsFromType(p.type);
    const decoded =
      price !== null
        ? `  decoded_price=${price}${term !== null ? `  decoded_term_months=${term}` : ""}`
        : "";
    lines.push(
      `  - port ${p.portId}  on_offer=${p.offerId}  terminal=${p.terminal}  max_bindings=${p.max_bindings}  type=${JSON.stringify(p.type)}${decoded}`,
    );
  }

  lines.push("BINDS:");
  for (const b of snapshot.binds) {
    lines.push(`  - offer ${b.offerId}  port ${b.portId}`);
  }

  return lines.join("\n");
}
