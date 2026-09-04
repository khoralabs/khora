/** Re-export post content signing from auth (canonical home). */
export {
  canonicalKhoraPostSigningPayload,
  KHORA_POST_SIGNATURE_V1,
  type KhoraPostSigningPayloadV1,
  khoraPostSigningPayloadFromCreate,
  khoraPostSigningPayloadFromPatch,
  signingPayloadForPatch,
  signKhoraPostPayload,
  verifyKhoraPostSignature,
} from "@khoralabs/khora-auth";
