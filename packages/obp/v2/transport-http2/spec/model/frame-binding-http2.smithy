$version: "2"

namespace cfd.obp.frame.http2

@documentation("""
**Non-normative reference binding for `cfd.obp.frame#NegotiationFrameProtocol`.** The core frame rules do not depend on HTTP/2;
this documents how **`@khoralabs/obp-server`** carries frames in-repo.

**HTTP/2 reference binding for OBP frames (`obp://` / `obps://`).**

This is a **convenience profile**, not a dependency of **`cfd.obp.frame`**. Other transports (WebSocket, QUIC, in‑memory tests) **MAY**
reuse the same **Frame** JSON and signing rules with different byte framing.

**URL grammar:** **`obp://<host>:<port>/<actor_pubkey_hex>`** and **`obps://<host>:<port>/<actor_pubkey_hex>`**.
- **`actor_pubkey_hex`**: lowercase hex (typically **64** chars for **32**‑byte **Ed25519** public keys); must match the server's long‑term identity key used to sign outbound frames for that listener.
- **`obp://`**: cleartext **HTTP/2** over TCP using **h2c** (prior knowledge or upgrade as configured by the runtime).
- **`obps://`**: **HTTP/2** over **TLS** (**ALPN** `h2`).

**HTTP mapping:**
- **Path:** implementations **SHOULD** use **`POST /obp/v1`** for client‑initiated streams (the single path simplifies routing).
- **Streams:** one logical OBP negotiation session maps to **one** HTTP/2 **client request stream** (request + response body as a duplex channel of DATA frames once both halves are open). The server **MUST** treat each such stream as an isolated **FrameChannel** with ordering preserved by HTTP/2.
- **Bytes on the stream:** length‑prefixed canonical JSON as defined in **`cfd.obp.frame#NegotiationFrameProtocol`** — **`uint32_be`** length followed by UTF‑8 JSON for **`{ "init": ... }`** then **`Frame`** objects. **`Frame.body`** is opaque at the frame layer; NBC profiles define negotiation payload layout when used.

**Actor reconciliation:** The URL **`actor_pubkey_hex`** identifies the **server** listener. The **`init`** payload, **`party_ids`**, and subsequent
**Frame.actor** values identify speaking keys on the wire; implementations **SHOULD** verify that remote frames are signed by the
expected peer key established at handshake.

**Security:** use **`obps://`** on untrusted networks. **`obp://`** / h2c is for local/dev only unless otherwise threat‑modeled.
""")
service Http2Binding {
    version: "2026-05-05"
    operations: []
}

/// Parsed **`obp:`** / **`obps:`** addressing fields (documentation shape only).
structure FrameAddress {
    scheme: String
    host: String
    port: Integer
    actor_pubkey_hex: String
}
