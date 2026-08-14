import { randomId, sha256HexLower } from "@khoralabs/colonnade";
import type { KhoraHostContext } from "./context";

type CellInboxCtx = Pick<KhoraHostContext, "cluster" | "tenantKey">;

function recipientCell(ctx: CellInboxCtx, recipientDid: string) {
  const cellId = ctx.cluster.assignPrincipalToCell(recipientDid);
  return { cellId, cell: ctx.cluster.resolveCell(cellId) };
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
