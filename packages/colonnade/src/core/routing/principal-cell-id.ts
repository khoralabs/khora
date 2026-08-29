import { principalHomeId } from "../database-id";
import { encodeCellId } from "../owner-key-encoder";

/**
 * Encoded wire `CellId` for a principal’s home (`kind: "principal"`, `ownerKey: principalId`).
 * Default isolation unit for placement-backed clusters.
 */
export function principalHomeCellId(principalId: string): string {
  return encodeCellId(principalHomeId(principalId));
}
