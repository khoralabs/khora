import type { GraphSnapshot } from "@cfd/obp-core";
import type { Edge, Node } from "@xyflow/react";

/** React Flow `data` for offer nodes (includes full snapshot row for detail panel). */
export type DagOfferNodeData = {
  partyLabel: string;
  title: string;
  subtitle: string;
  detail: GraphSnapshot["offers"][number];
};

/** React Flow `data` for port nodes (includes full snapshot row for detail panel). */
export type DagPortNodeData = {
  partyLabel: string;
  title: string;
  subtitle: string;
  detail: GraphSnapshot["ports"][number];
};

/** React Flow `data` for BINDS edges (policy snapshot + answers at bind time). */
export type DagBindEdgeData = {
  detail: GraphSnapshot["binds"][number];
};

function shortId(id: string): string {
  return id.length <= 10 ? id : `${id.slice(0, 6)}…`;
}

function partyLabelForOffer(o: GraphSnapshot["offers"][number]): string {
  return o.partyName?.trim() || o.partyId?.trim() || "—";
}

/**
 * Left-to-right flowchart (no party nodes): genesis offers at the left edge, ports fanning right;
 * each bind places the **new** offer immediately to the right of the bound counterparty port.
 */
export function graphSnapshotToFlow(g: GraphSnapshot): { nodes: Node[]; edges: Edge[] } {
  const pad = 100;
  const partyStride = 120;
  const rowGap = 100;
  const genesisOfferX = 56;
  const dxOfferPorts = 400;
  const dxPortNextOffer = 300;

  const offerById = new Map(g.offers.map((o) => [o.id, o]));

  const bindSourceOffers = new Set(g.binds.map((b) => b.offerId));
  const portParentOffer = new Map<string, string>();
  for (const e of g.exposes) {
    if (!portParentOffer.has(e.portId)) {
      portParentOffer.set(e.portId, e.offerId);
    }
  }

  const offerParty = new Map<string, string>();
  for (const e of g.extends) {
    offerParty.set(e.offerId, e.partyId);
  }

  const partyY = new Map<string, number>();
  for (let i = 0; i < g.parties.length; i++) {
    const p = g.parties[i];
    if (p) partyY.set(p.id, pad + i * partyStride);
  }

  const offerX = new Map<string, number>();
  const offerY = new Map<string, number>();
  const portX = new Map<string, number>();
  const portY = new Map<string, number>();

  const genesisOffers = g.offers.filter((o) => !bindSourceOffers.has(o.id));

  function layoutPortsForOffer(offerId: string): void {
    const portIds = g.exposes.filter((e) => e.offerId === offerId).map((e) => e.portId);
    const seen = new Set<string>();
    const ports = portIds.filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    ports.sort((a, b) => a.localeCompare(b));
    const ox = offerX.get(offerId);
    const oy = offerY.get(offerId);
    if (ox === undefined || oy === undefined) return;
    const n = ports.length;
    const mid = n === 0 ? 0 : ((n - 1) * rowGap) / 2;
    for (let i = 0; i < n; i++) {
      const pid = ports[i];
      if (pid === undefined) continue;
      portX.set(pid, ox + dxOfferPorts);
      portY.set(pid, oy + i * rowGap - mid);
    }
  }

  const genesisByParty = new Map<string, typeof genesisOffers>();
  for (const o of genesisOffers) {
    const pid = offerParty.get(o.id);
    const key = pid ?? "_";
    const list = genesisByParty.get(key) ?? [];
    list.push(o);
    genesisByParty.set(key, list);
  }
  for (const [, list] of genesisByParty) {
    list.sort((a, b) => a.id.localeCompare(b.id));
  }

  for (const o of genesisOffers) {
    const pid = offerParty.get(o.id);
    const list = genesisByParty.get(pid ?? "_") ?? [o];
    const idx = list.findIndex((x) => x.id === o.id);
    const baseY = pid ? (partyY.get(pid) ?? pad) : pad;
    offerX.set(o.id, genesisOfferX);
    offerY.set(o.id, baseY + Math.max(0, idx) * rowGap);
  }
  for (const o of genesisOffers) {
    layoutPortsForOffer(o.id);
  }

  const offerDepth = new Map<string, number>();
  for (const o of genesisOffers) {
    offerDepth.set(o.id, 0);
  }
  for (let iter = 0; iter < g.offers.length + g.binds.length + 2; iter++) {
    let changed = false;
    for (const b of g.binds) {
      const parentOffer = portParentOffer.get(b.portId);
      if (parentOffer === undefined) continue;
      const pd = offerDepth.get(parentOffer);
      if (pd === undefined) continue;
      const nd = pd + 1;
      const cur = offerDepth.get(b.offerId);
      if (cur === undefined || cur > nd) {
        offerDepth.set(b.offerId, nd);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const sortedBinds = [...g.binds].sort((a, b) => {
    const da = offerDepth.get(a.offerId) ?? 1_000_000;
    const db = offerDepth.get(b.offerId) ?? 1_000_000;
    if (da !== db) return da - db;
    return a.offerId.localeCompare(b.offerId);
  });

  const successorIndexByPort = new Map<string, number>();

  for (let bi = 0; bi < sortedBinds.length; bi++) {
    const b = sortedBinds[bi];
    if (b === undefined) continue;
    const po = portParentOffer.get(b.portId);
    if (po !== undefined && offerX.has(po) && !portX.has(b.portId)) {
      layoutPortsForOffer(po);
    }
    const px = portX.get(b.portId);
    const py = portY.get(b.portId);
    const si = successorIndexByPort.get(b.portId) ?? 0;
    successorIndexByPort.set(b.portId, si + 1);
    if (px !== undefined && py !== undefined) {
      offerX.set(b.offerId, px + dxPortNextOffer);
      offerY.set(b.offerId, py + si * rowGap);
    } else {
      const maxOx = offerX.size === 0 ? genesisOfferX : Math.max(...offerX.values());
      offerX.set(b.offerId, maxOx + dxPortNextOffer);
      offerY.set(b.offerId, pad + bi * rowGap);
    }
    layoutPortsForOffer(b.offerId);
  }

  let orphanCol =
    (offerX.size === 0 ? genesisOfferX : Math.max(...offerX.values())) +
    dxOfferPorts +
    dxPortNextOffer;
  for (const o of g.offers) {
    if (!offerX.has(o.id)) {
      offerX.set(o.id, orphanCol);
      offerY.set(o.id, pad + g.offers.indexOf(o) * rowGap);
      orphanCol += dxOfferPorts + dxPortNextOffer;
      layoutPortsForOffer(o.id);
    }
  }

  const nodes: Node[] = [];

  for (const o of g.offers) {
    nodes.push({
      id: `offer:${o.id}`,
      type: "offer",
      position: { x: offerX.get(o.id) ?? genesisOfferX, y: offerY.get(o.id) ?? pad },
      data: {
        partyLabel: partyLabelForOffer(o),
        title: shortId(o.id),
        subtitle: o.type.slice(0, 48),
        detail: o,
      } satisfies DagOfferNodeData,
    });
  }

  for (const p of g.ports) {
    const parentOfferId = portParentOffer.get(p.id);
    const parentOffer = parentOfferId !== undefined ? offerById.get(parentOfferId) : undefined;
    const portPartyLabel = parentOffer !== undefined ? partyLabelForOffer(parentOffer) : "—";
    const portFallbackX =
      parentOfferId !== undefined
        ? (offerX.get(parentOfferId) ?? genesisOfferX) + dxOfferPorts
        : genesisOfferX + dxOfferPorts;
    nodes.push({
      id: `port:${p.id}`,
      type: "port",
      position: {
        x: portX.get(p.id) ?? portFallbackX,
        y: portY.get(p.id) ?? pad,
      },
      data: {
        partyLabel: portPartyLabel,
        title: `${shortId(p.id)}${p.terminal ? " ⌁" : ""}`,
        subtitle: p.type.slice(0, 40),
        detail: p,
      } satisfies DagPortNodeData,
    });
  }

  const edges: Edge[] = [];

  for (const e of g.exposes) {
    edges.push({
      id: `exp:${e.offerId}:${e.portId}`,
      source: `offer:${e.offerId}`,
      target: `port:${e.portId}`,
      style: { stroke: "#262626", strokeWidth: 1.25 },
    });
  }

  for (const e of g.binds) {
    edges.push({
      id: `bind:${e.offerId}:${e.portId}`,
      source: `port:${e.portId}`,
      target: `offer:${e.offerId}`,
      style: { stroke: "#404040", strokeWidth: 1.25, strokeDasharray: "6 4" },
      data: { detail: e } satisfies DagBindEdgeData,
    });
  }

  return { nodes, edges };
}
