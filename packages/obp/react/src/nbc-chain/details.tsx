import type { NbcChainGraph } from "@khoralabs/obp-v2-nbc";
import type { Edge, Node } from "@xyflow/react";
import type { ComponentProps } from "react";
import { formatExpiresTurn, formatRelayMs } from "./format.ts";
import type {
  NbcChainBindEdgeData,
  NbcChainOfferNodeData,
  NbcChainPortNodeData,
} from "./layout.ts";

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  const text = value === undefined ? "—" : JSON.stringify(value, null, 2);
  return (
    <div data-slot="nbc-chain-json-block">
      <div data-slot="nbc-chain-json-label">{label}</div>
      <pre data-slot="nbc-chain-json-pre">{text}</pre>
    </div>
  );
}

export type NbcChainNodeDetailsProps = ComponentProps<"section"> & {
  node: Node;
  graph: NbcChainGraph;
};

export function NbcChainNodeDetails({ node, graph, ...rest }: NbcChainNodeDetailsProps) {
  if (node.type === "offer") {
    const data = node.data as NbcChainOfferNodeData;
    const o = data.detail;
    const bindsFromOffer = graph.binds.filter((b) => b.offerId === o.id);
    return (
      <section
        data-slot="nbc-chain-node-details"
        data-node-kind="offer"
        {...rest}
        onPointerDown={(e) => {
          e.stopPropagation();
          rest.onPointerDown?.(e);
        }}
        aria-label={rest["aria-label"] ?? "Offer details"}
      >
        <div data-slot="nbc-chain-details-heading">Offer</div>
        <dl data-slot="nbc-chain-details-dl">
          <dt data-slot="nbc-chain-details-dt">Id</dt>
          <dd data-slot="nbc-chain-details-dd">
            <code>{o.id}</code>
          </dd>
          <dt data-slot="nbc-chain-details-dt">Type</dt>
          <dd data-slot="nbc-chain-details-dd">{o.type}</dd>
          <dt data-slot="nbc-chain-details-dt">Party</dt>
          <dd data-slot="nbc-chain-details-dd">{o.partyName ?? o.partyId ?? "—"}</dd>
          <dt data-slot="nbc-chain-details-dt">expires_turn</dt>
          <dd data-slot="nbc-chain-details-dd">{formatExpiresTurn(o.expires_turn)}</dd>
          <dt data-slot="nbc-chain-details-dt">expires_at_relay_ms</dt>
          <dd data-slot="nbc-chain-details-dd">{formatRelayMs(o.expires_at_relay_ms)}</dd>
          <dt data-slot="nbc-chain-details-dt">Expired</dt>
          <dd data-slot="nbc-chain-details-dd">
            {o.expired === true ? "yes" : o.expired === false ? "no" : "—"}
          </dd>
        </dl>
        {bindsFromOffer.length === 0 ? (
          <div data-slot="nbc-chain-details-bind-empty">
            <div data-slot="nbc-chain-details-subheading">bind_payload</div>
            <p data-slot="nbc-chain-details-empty-copy">
              No bind on this offer (e.g. genesis extend or bind omitted).
            </p>
          </div>
        ) : (
          bindsFromOffer.map((b) => (
            <div data-slot="nbc-chain-details-bind-group" key={`${b.portId}`}>
              <div data-slot="nbc-chain-details-subheading">Bound counterparty port</div>
              <dl data-slot="nbc-chain-details-dl">
                <dt data-slot="nbc-chain-details-dt">Port id</dt>
                <dd data-slot="nbc-chain-details-dd">
                  <code>{b.portId}</code>
                </dd>
              </dl>
              <JsonBlock label="bind_payload (submitted)" value={b.bind_payload} />
            </div>
          ))
        )}
      </section>
    );
  }
  if (node.type === "port") {
    const data = node.data as NbcChainPortNodeData;
    const p = data.detail;
    return (
      <section
        data-slot="nbc-chain-node-details"
        data-node-kind="port"
        {...rest}
        onPointerDown={(e) => {
          e.stopPropagation();
          rest.onPointerDown?.(e);
        }}
        aria-label={rest["aria-label"] ?? "Port details"}
      >
        <div data-slot="nbc-chain-details-heading">Port</div>
        <dl data-slot="nbc-chain-details-dl">
          <dt data-slot="nbc-chain-details-dt">Id</dt>
          <dd data-slot="nbc-chain-details-dd">
            <code>{p.id}</code>
          </dd>
          <dt data-slot="nbc-chain-details-dt">Type</dt>
          <dd data-slot="nbc-chain-details-dd">{p.type}</dd>
          <dt data-slot="nbc-chain-details-dt">Promise</dt>
          <dd data-slot="nbc-chain-details-dd" data-variant="promise">
            {p.promise || "—"}
          </dd>
          <dt data-slot="nbc-chain-details-dt">Terminal (NBC overlay)</dt>
          <dd data-slot="nbc-chain-details-dd">
            {p.terminal === true ? "yes" : p.terminal === false ? "no" : "—"}
          </dd>
          <dt data-slot="nbc-chain-details-dt">Max bindings (NBC overlay)</dt>
          <dd data-slot="nbc-chain-details-dd">{p.max_bindings ?? "—"}</dd>
          <dt data-slot="nbc-chain-details-dt">Bind count</dt>
          <dd data-slot="nbc-chain-details-dd">{p.bindCount}</dd>
          <dt data-slot="nbc-chain-details-dt">Ref</dt>
          <dd data-slot="nbc-chain-details-dd">{p.ref.trim() === "" ? "—" : p.ref}</dd>
          <dt data-slot="nbc-chain-details-dt">Exposed on offers</dt>
          <dd data-slot="nbc-chain-details-dd" data-variant="code-list">
            <code>{p.exposedOnOfferIds.join(", ") || "—"}</code>
          </dd>
          <dt data-slot="nbc-chain-details-dt">expires_turn</dt>
          <dd data-slot="nbc-chain-details-dd">{formatExpiresTurn(p.expires_turn)}</dd>
          <dt data-slot="nbc-chain-details-dt">expires_at_relay_ms</dt>
          <dd data-slot="nbc-chain-details-dd">{formatRelayMs(p.expires_at_relay_ms)}</dd>
          <dt data-slot="nbc-chain-details-dt">Expired</dt>
          <dd data-slot="nbc-chain-details-dd">
            {p.expired === true ? "yes" : p.expired === false ? "no" : "—"}
          </dd>
        </dl>
        <JsonBlock label="bind_policy (NBC / session)" value={p.bind_policy} />
      </section>
    );
  }
  return null;
}

export type NbcChainEdgeDetailsProps = ComponentProps<"section"> & {
  edge: Edge;
};

export function NbcChainEdgeDetails({ edge, ...rest }: NbcChainEdgeDetailsProps) {
  const data = edge.data as NbcChainBindEdgeData | undefined;
  const d = data?.detail;

  if (d === undefined) {
    return null;
  }
  return (
    <section
      data-slot="nbc-chain-edge-details"
      {...rest}
      onPointerDown={(e) => {
        e.stopPropagation();
        rest.onPointerDown?.(e);
      }}
      aria-label={rest["aria-label"] ?? "Bind edge details"}
    >
      <div data-slot="nbc-chain-details-heading">Bind</div>
      <dl data-slot="nbc-chain-details-dl">
        <dt data-slot="nbc-chain-details-dt">Offer id</dt>
        <dd data-slot="nbc-chain-details-dd">
          <code>{d.offerId}</code>
        </dd>
        <dt data-slot="nbc-chain-details-dt">Port id</dt>
        <dd data-slot="nbc-chain-details-dd">
          <code>{d.portId}</code>
        </dd>
      </dl>
      <JsonBlock label="bind_payload" value={d.bind_payload} />
    </section>
  );
}

export type NbcChainEmptySelectionHintProps = ComponentProps<"div">;

export function NbcChainEmptySelectionHint({ ...rest }: NbcChainEmptySelectionHintProps) {
  return (
    <div
      data-slot="nbc-chain-empty-selection-hint"
      {...rest}
      onPointerDown={(e) => {
        e.stopPropagation();
        rest.onPointerDown?.(e);
      }}
    >
      Click an offer, port, or bind edge (dashed). Ports show NBC/session bind_policy when provided;
      offers list bind_payload per bind; dashed edges summarize projection fields.
    </div>
  );
}
