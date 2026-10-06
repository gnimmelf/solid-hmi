# Browser Window Channel for an HMI

This component demonstrates communication between a dashboard window and the more detailed HMI views that it opens in separate browser windows. It uses the browser's `BroadcastChannel` API through `WindowChannelRegistry`.

## Topology

The current implementation is not a true peer-to-peer network. It is a root-scoped broadcast group with a root-maintained registry:

- The first window is the root and creates a `rootId`.
- Each child receives the `rootId` and a unique `windowId` in its URL.
- All windows use the same named `BroadcastChannel`.
- Messages from another root group are ignored.
- Children announce when they register and unregister.
- The root maintains a reactive list of child window IDs.
- Application messages are broadcast to every window in the group.

Although every window can publish and receive messages, `BroadcastChannel` does not create direct connections between peers. It provides a same-origin group bus without addressing, routing, persistence, acknowledgements, or delivery guarantees.

`MessageChannel` can later provide dedicated point-to-point links when targeted or high-volume communication is needed. The root would normally establish and distribute those connections, while `BroadcastChannel` remains useful for discovery and group events.

## Current Strengths

The prototype is a useful starting point because it already provides:

- Unique root and window identities.
- Isolation between independent root window groups.
- Child registration and unregistration.
- Duplicate registration protection.
- Runtime validation of the common message envelope.
- Solid-reactive peer state.
- Explicit connection and page lifecycle cleanup.

This is sufficient for experimentation and non-critical synchronization of presentation state, such as selected equipment, navigation context, filters, and display preferences.

## Limitations

The current implementation is not yet suitable for operational command and control without additional safeguards.

### Stale peers

`pagehide` is not guaranteed after a browser crash, forced process termination, device sleep, or loss of resources. The root can therefore retain window IDs that no longer exist. Add periodic heartbeats and expire peers that have not been seen within a defined timeout.

### Reload races

A child reload reuses the `windowId` stored in its URL. A delayed `unregister` from the old document could remove the newly loaded document from the registry. Give every document instance a separate session or incarnation ID and apply lifecycle messages to that instance.

### Initial state synchronization

A new child only registers; it does not receive the current application state. Introduce an explicit handshake, for example:

1. Child sends `register`.
2. Root replies with a state snapshot.
3. Child applies the snapshot and sends `ready`.
4. Incremental updates begin.

The snapshot should include a schema version so incompatible windows can fail clearly.

### Targeted communication

Every application message is currently delivered to all windows in the root group. Add an optional `recipientId` for logical addressing. Use `MessageChannel` only where a dedicated stream or transferable objects provide a concrete benefit.

### Trust and authorization

Any same-origin page that knows the channel name can publish a structurally valid message. Validate the payload for each message type and consider an unguessable group token. Channel membership must not be treated as authorization for control actions.

### Delivery semantics

`BroadcastChannel` does not persist messages and does not guarantee that a window was alive or ready to receive one. Important operations require message IDs, acknowledgements, timeouts, retries where appropriate, and idempotent handlers.

### Reconnection

Disconnecting closes the underlying `BroadcastChannel`, so the current registry instance cannot reconnect. Either document the registry as single-use or create and attach the channel during `connect()` and release it during `disconnect()`.

## Recommended Boundary

Use this browser channel to coordinate windows and synchronize user-interface state. Keep authoritative process state, alarms, permissions, audit records, and control commands in a backend service. A browser window may disappear at any time, and browser messaging must not become the system of record.

For commands initiated by the UI, send the request to the backend and let the backend validate, execute, persist, and publish the resulting state. Cross-window messages can then prompt immediate UI updates, while the backend remains the recovery and reconciliation source.

## Suggested Hardening Order

1. Define typed message payloads and validate each message type.
2. Add a registration and state-snapshot handshake.
3. Add document instance IDs, heartbeats, and peer expiry.
4. Add recipient IDs for targeted messages.
5. Add message IDs and acknowledgements only for workflows that require them.
6. Add coordinator recovery if operation must continue after the root closes.
7. Introduce `MessageChannel` for specific point-to-point traffic when measurements show that broadcast is insufficient.

This keeps the architecture simple while establishing the lifecycle and correctness guarantees needed by a multi-window HMI.