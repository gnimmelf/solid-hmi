# Browser Window Channel for an HMI

This component demonstrates communication between a dashboard window and the more detailed HMI views that it opens in separate browser windows. It uses the browser's `BroadcastChannel` API through `WindowChannelRegistry`.

## Topology

The implementation is a root-scoped broadcast group with a recoverable coordinator:

- The first window is the root and creates a `rootId`.
- Each child receives the `rootId` and a unique `windowId` in its URL.
- All windows use the same named `BroadcastChannel`.
- Messages from another root group are ignored.
- Every document has a separate session ID and announces when it registers and unregisters.
- Every window maintains a reactive list of live peers from lifecycle messages and heartbeats.
- The root begins as coordinator; surviving windows elect the lowest window ID if it disappears.
- Application messages can be broadcast or addressed to one window.
- Opener-child pairs establish a `MessageChannel`; addressed messages otherwise use the broadcast bus.

Although every window can publish and receive messages, `BroadcastChannel` does not create direct connections between peers. It provides a same-origin group bus without addressing, routing, persistence, acknowledgements, or delivery guarantees.

`BroadcastChannel` remains the discovery, lifecycle, and group-event transport. A direct port is an optimization, not a separate source of truth.

## Implemented Hardening

The registry now provides:

- Valibot validation for the envelope, lifecycle payloads, snapshots, and application-defined message payloads.
- Unique root, window, and document-session identities.
- Isolation between independent root window groups.
- Registration, versioned state snapshot, and ready handshake.
- Explicit rejection through `error()` when schema versions are incompatible.
- Heartbeats and expiry for windows that vanish without sending `pagehide`.
- Session-aware unregister handling, so a stale document cannot remove its replacement.
- Optional recipient IDs and acknowledgement, timeout, retry, and duplicate-suppression handling.
- Coordinator recovery after the original root closes.
- Reconnectable registry instances and explicit lifecycle cleanup.

Application schemas and snapshot behavior are supplied through the registry options. Incremental application messages are ignored until the initial snapshot has been validated and applied.

## Remaining Boundaries

This remains suitable for synchronization of presentation state, such as selected equipment, navigation context, filters, and display preferences. It is not a system of record.

### Trust and authorization

The root ID is an unguessable group token under normal creation, but any same-origin page that obtains it can publish structurally valid messages. Payload validation and channel membership are not authorization for control actions.

### Delivery semantics

Messages are not persisted. Optional acknowledgements confirm handling by a currently connected recipient and retries are deduplicated, but they do not provide durable or exactly-once delivery. Handlers for important workflows must remain idempotent.

### Coordinator recovery

Election preserves coordination after the root closes, but all windows can still disappear together. A newly elected coordinator only has the state that reached that browser document; durable recovery still belongs in the backend.

### Direct channels

Direct ports are established only between opener and child. Addressed sibling traffic deliberately falls back to `BroadcastChannel`; add port brokering only if measurements show that sibling traffic needs it.

## Recommended Boundary

Use this browser channel to coordinate windows and synchronize user-interface state. Keep authoritative process state, alarms, permissions, audit records, and control commands in a backend service. A browser window may disappear at any time, and browser messaging must not become the system of record.

For commands initiated by the UI, send the request to the backend and let the backend validate, execute, persist, and publish the resulting state. Cross-window messages can then prompt immediate UI updates, while the backend remains the recovery and reconciliation source.

The registry intentionally keeps acknowledgements and direct delivery opt-in. Normal presentation updates should continue using broadcast because newer snapshots and backend reconciliation are the recovery path.