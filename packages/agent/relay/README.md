# @khoralabs/agent-relay

Fan-out inbox delivery, topic subscriptions, principal registration / notification buffer, and optional ticket-gated **frame-channel** multiplexing over a byte stream (`FrameChannelHubPort`). Transport-agnostic: persistence ports are app-defined.

Khora mounts this relay with SQLite adapters and Memories search alongside it—not inside it.
