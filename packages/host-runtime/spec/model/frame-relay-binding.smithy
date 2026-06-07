$version: "2"

namespace khora.agent.relay

use khora.obp.frame#Frame

@documentation("""
**Host relay wire policy — not part of core `khora.obp.frame`.**

Core negotiation DAG rules (**`Frame`**, **`p_hash`**, signatures) are **`khora.obp.frame#NegotiationFrameProtocol`**.
This structure is the **optional deployment policy** for **hub-mediated** OBP frame channels (e.g. **`@khoralabs/host-runtime`**):
a trusted relay wraps each forwarded **`Frame`** so both peers observe the same **`relay_ts_ms`** (e.g. for **`khora.obp.nbc`** N1 relay-time bind windows).

Deployments that **do not** use a hub relay **MUST NOT** be required to adopt this envelope; direct byte streams **MAY** send bare **`khora.obp.frame#Frame`** objects.

**Relay MUST:** stamp **`relay_ts_ms`** at the instant it forwards the message and deliver the **same** envelope to **all** connected peers **including the sender** (echo).

**Echo rule:** Originators MUST apply **`Frame`** effects only from **`RelayEnvelope`** bytes received back from the relay (including self-echo), not from the pre-relay send path, so **`relay_ts_ms`** and DAG advance stay consistent with the counterparty.

**Relationship to OBP framing:** Length-prefixed canonical JSON and **`init`** envelopes follow **`khora.obp.frame#NegotiationFrameProtocol`**; this policy only defines the JSON object shape between **`init`** messages when a relay is in use.
""")
structure RelayEnvelope {
    frame: Frame
    relay_ts_ms: Long
}
