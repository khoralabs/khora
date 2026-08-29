/** Opaque database kind (host-defined: `"principal"`, `"account"`, …). */
export type ColonnadeDatabaseKind = string;

/**
 * Isolation unit for a colonnade home cell — same shape as memories-service
 * `{ kind, ownerKey }`. Wire `CellId` is the reversible encoding of this id.
 */
export type ColonnadeDatabaseId = {
  readonly kind: ColonnadeDatabaseKind;
  readonly ownerKey: string;
};

export type ColonnadeDatabaseListFilter = {
  readonly kind?: ColonnadeDatabaseKind;
};

/** Default kind for a principal’s home cell when the host does not override. */
export const COLONNADE_PRINCIPAL_KIND = "principal";

export function principalHomeId(principalId: string): ColonnadeDatabaseId {
  return { kind: COLONNADE_PRINCIPAL_KIND, ownerKey: principalId };
}
