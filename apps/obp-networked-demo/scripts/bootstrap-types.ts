import type { webcrypto } from "node:crypto";
import type { Party, SessionInit } from "@cfd/obp-core";

export type ObpDemoBootstrapFile = {
  init: SessionInit;
  parties: Party[];
  responder: { privateKey: webcrypto.JsonWebKey; publicKey: webcrypto.JsonWebKey };
  initiator: { privateKey: webcrypto.JsonWebKey; publicKey: webcrypto.JsonWebKey };
};
