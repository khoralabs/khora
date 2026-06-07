$version: "2"

namespace khora.obp.frame.relay

use smithy.api#Blob
use smithy.api#Unit

@documentation("""
**Frame relay store** — durable admission secrets and opaque relayed byte spool for hub-mediated channels.

The hub runtime (`@khoralabs/obp-frame-relay`) attaches live peers and fans out bytes; this service models **only** the persistence surface backends must implement. Payload bytes are **opaque** at this layer (relay stamping policy is **`khora.obp.frame.relay#RelayEnvelope`** in the hub runtime).

Reference SQLite table names: `rooms` (channel admission), `room_frames` (relayed byte spool).
""")
service FrameRelayStore {
    version: "2026-06-01"
    operations: [
        UpsertChannelAdmission
        GetActiveChannelAdmissionSecret
        EnqueueRelayedFrame
        ListRelayedFramesAfter
        PurgeRelayedFramesForChannel
        DeleteChannelAdmission
    ]
}

structure ChannelAdmission {
    channel_id: String
    pairing_secret_hex: String
    created_at_ms: Long
    expires_at_ms: Long
}

structure RelayedFrame {
    id: Long
    bytes: Blob
}

list RelayedFrameList {
    member: RelayedFrame
}

structure UpsertChannelAdmissionInput {
    admission: ChannelAdmission
}

structure UpsertChannelAdmissionOutput {
    @documentation("Empty success.")
}

structure GetActiveChannelAdmissionSecretInput {
    channel_id: String
    now_ms: Long
}

union GetActiveChannelAdmissionSecretResult {
    active: String
    inactive: Unit
}

structure GetActiveChannelAdmissionSecretOutput {
    result: GetActiveChannelAdmissionSecretResult
}

structure EnqueueRelayedFrameInput {
    channel_id: String
    bytes: Blob
}

structure EnqueueRelayedFrameOutput {
    frame_id: Long
}

structure ListRelayedFramesAfterInput {
    channel_id: String
    after_frame_id: Long
}

structure ListRelayedFramesAfterOutput {
    frames: RelayedFrameList
}

structure PurgeRelayedFramesForChannelInput {
    channel_id: String
}

structure PurgeRelayedFramesForChannelOutput {
    @documentation("Empty success.")
}

structure DeleteChannelAdmissionInput {
    channel_id: String
}

structure DeleteChannelAdmissionOutput {
    @documentation("Empty success.")
}
