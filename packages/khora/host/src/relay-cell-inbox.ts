import { randomId, sha256HexLower } from "@khoralabs/colonnade-persistence";
import type { KhoraHostContext } from "./context";

type CellInboxCtx = Pick<KhoraHostContext, "cluster" | "tenantKey">;

function recipientCell(ctx: CellInboxCtx, recipientDid: string) {
  const cellId = ctx.cluster.assignPrincipalToCell(recipientDid);
  return { cellId, cell: ctx.cluster.resolveCell(cellId) };
}

function projectionFromInlineBytes(bytes: Uint8Array): unknown | undefined {
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return undefined;
  }
}

function roomIdFromProjection(projection: unknown): string | undefined {
  if (projection === null || typeof projection !== "object" || Array.isArray(projection)) {
    return undefined;
  }
  const channelId = (projection as Record<string, unknown>).channelId;
  return typeof channelId === "string" && channelId.length > 0 ? channelId : undefined;
}

/** Enqueue a small JSON payload on the recipient's home cell inbox (inline staging). */
export async function enqueueCellInboxInline(
  ctx: CellInboxCtx,
  recipientDid: string,
  payload: unknown,
  correlationId?: string,
): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const content_hash = sha256HexLower(bytes);
  const { cellId, cell } = recipientCell(ctx, recipientDid);
  const out = await cell.enqueueInboxDelivery({
    cell_id: cellId,
    tenant_key: ctx.tenantKey,
    recipient_principal_id: recipientDid,
    staging: { kind: "inline", inline: { bytes, content_hash } },
    correlation_id: correlationId ?? randomId("inbox"),
  });
  return out.inbox_entry_id;
}

/** Remove pending room-ticket inline inbox rows for one room on a recipient's cell. */
export async function discardCellInboxRoomTickets(
  ctx: CellInboxCtx,
  recipientDid: string,
  roomId: string,
): Promise<void> {
  const { cellId, cell } = recipientCell(ctx, recipientDid);
  const list = await cell.listPendingInboxEntries({
    cell_id: cellId,
    tenant_key: ctx.tenantKey,
    principal_id: recipientDid,
    limit: 256,
    cursor: "",
  });
  const toDiscard: string[] = [];
  for (const e of list.entries) {
    if (e.staging.kind !== "inline") continue;
    const projection = projectionFromInlineBytes(e.staging.inline.bytes);
    if (
      projection !== null &&
      typeof projection === "object" &&
      !Array.isArray(projection) &&
      (projection as Record<string, unknown>).kind === "room_ticket" &&
      roomIdFromProjection(projection) === roomId
    ) {
      toDiscard.push(e.inbox_entry_id);
    }
  }
  if (toDiscard.length === 0) return;
  await cell.discardInboxEntries({
    cell_id: cellId,
    tenant_key: ctx.tenantKey,
    principal_id: recipientDid,
    inbox_entry_ids: toDiscard,
  });
}

/** Drop all pending inbox rows for a principal on their home cell. */
export async function discardAllCellInboxForPrincipal(
  ctx: CellInboxCtx,
  principalDid: string,
): Promise<void> {
  const { cellId, cell } = recipientCell(ctx, principalDid);
  const list = await cell.listPendingInboxEntries({
    cell_id: cellId,
    tenant_key: ctx.tenantKey,
    principal_id: principalDid,
    limit: 256,
    cursor: "",
  });
  if (list.entries.length === 0) return;
  await cell.discardInboxEntries({
    cell_id: cellId,
    tenant_key: ctx.tenantKey,
    principal_id: principalDid,
    inbox_entry_ids: list.entries.map((e) => e.inbox_entry_id),
  });
}
