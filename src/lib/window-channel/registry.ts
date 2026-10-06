import { createSignal, type Accessor } from "solid-js";
import * as v from "valibot";

import {
  DIRECT_MESSAGE_KIND,
  DirectAcceptSchema,
  DirectRequestSchema,
  EnvelopeSchema,
  HeartbeatSchema,
  isRegistryMessage,
  RegisterSchema,
  RegistrySchemas,
  RegistryType,
  RejectedSchema,
  SnapshotSchema,
} from "./schemas";
import type {
  Peer,
  PendingAcknowledgment,
  RegistryMessageType,
  SendOptions,
  WindowChannelMessage,
  WindowChannelMessageFor,
  WindowChannelOptions,
  WindowChannelSchemas,
} from "./types";

const ROOT_ID_PARAM = "rootId";
const WINDOW_ID_PARAM = "uuid";

export class WindowChannelRegistry<
  TSchemas extends WindowChannelSchemas = WindowChannelSchemas,
> {
  readonly windowId: string;
  readonly sessionId = crypto.randomUUID();
  readonly rootId: string;
  readonly isRoot: boolean;
  readonly peers: Accessor<readonly string[]>;
  readonly coordinatorId: Accessor<string>;
  readonly ready: Accessor<boolean>;
  readonly error: Accessor<string | undefined>;

  private readonly channelName: string;
  private readonly schemas: WindowChannelSchemas;
  private readonly schemaVersion: string;
  private readonly state?: WindowChannelOptions<TSchemas>["state"];
  private readonly heartbeatIntervalMs: number;
  private readonly peerTimeoutMs: number;
  private readonly defaultAckTimeoutMs: number;
  private readonly defaultAckRetries: number;
  private readonly listeners = new Set<
    (message: WindowChannelMessageFor<TSchemas>) => void
  >();
  private readonly peerRecords = new Map<string, Peer>();
  private readonly directPorts = new Map<string, MessagePort>();
  private readonly seenMessageIds = new Set<string>();
  private readonly pendingAcknowledgments = new Map<string, PendingAcknowledgment>();
  private readonly setPeers: (value: string[] | ((peers: string[]) => string[])) => string[];
  private readonly setCoordinatorId: (value: string) => string;
  private readonly setReady: (value: boolean) => boolean;
  private readonly setError: (value: string | undefined) => string | undefined;
  private channel?: BroadcastChannel;
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private connected = false;

  constructor(
    channelName: string,
    locationUrl = window.location.href,
    options: WindowChannelOptions<TSchemas> = {},
  ) {
    const url = new URL(locationUrl);
    const rootId = url.searchParams.get(ROOT_ID_PARAM);

    this.channelName = channelName;
    this.isRoot = rootId === null;
    this.rootId = rootId ?? crypto.randomUUID();
    this.windowId = url.searchParams.get(WINDOW_ID_PARAM) ?? this.rootId;
    this.schemas = options.schemas ?? {};
    this.schemaVersion = options.schemaVersion ?? "1";
    this.state = options.state;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 2_000;
    this.peerTimeoutMs = options.peerTimeoutMs ?? 6_000;
    this.defaultAckTimeoutMs = options.ackTimeoutMs ?? 1_000;
    this.defaultAckRetries = options.ackRetries ?? 2;

    const [peers, setPeers] = createSignal<string[]>([]);
    const [coordinatorId, setCoordinatorId] = createSignal(this.rootId);
    const [ready, setReady] = createSignal(this.isRoot || !this.state);
    const [error, setError] = createSignal<string>();
    this.peers = peers;
    this.setPeers = setPeers;
    this.coordinatorId = coordinatorId;
    this.setCoordinatorId = setCoordinatorId;
    this.ready = ready;
    this.setReady = setReady;
    this.error = error;
    this.setError = setError;
  }

  connect = () => {
    if (this.connected) return this.disconnect;

    this.connected = true;
    this.setError(undefined);
    this.channel = new BroadcastChannel(this.channelName);
    this.channel.addEventListener("message", this.handleBroadcastMessage);
    window.addEventListener("message", this.handleWindowMessage);
    window.addEventListener("pagehide", this.disconnect);
    this.requestDirectConnection();
    this.sendRegistryMessage(RegistryType.Register, { schemaVersion: this.schemaVersion });
    this.sendHeartbeat();
    this.heartbeatTimer = setInterval(this.sendHeartbeat, this.heartbeatIntervalMs);
    return this.disconnect;
  };

  disconnect = () => {
    if (!this.connected) return;

    this.sendRegistryMessage(RegistryType.Unregister, {});
    this.connected = false;
    window.removeEventListener("pagehide", this.disconnect);
    window.removeEventListener("message", this.handleWindowMessage);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.channel?.removeEventListener("message", this.handleBroadcastMessage);
    this.channel?.close();
    this.channel = undefined;
    this.directPorts.forEach((port) => port.close());
    this.directPorts.clear();
    this.pendingAcknowledgments.forEach((pending) => {
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(new Error("Window channel disconnected"));
    });
    this.pendingAcknowledgments.clear();
    this.peerRecords.clear();
    this.setPeers([]);
  };

  openChild(url = window.location.href) {
    const childUrl = new URL(url);
    childUrl.searchParams.set(ROOT_ID_PARAM, this.rootId);
    childUrl.searchParams.set(WINDOW_ID_PARAM, crypto.randomUUID());
    return window.open(childUrl, "_blank");
  }

  broadcast<K extends keyof TSchemas & string>(
    type: K,
    data: v.InferOutput<TSchemas[K]>,
    options: SendOptions = {},
  ): Promise<void> {
    const schema = this.schemas[type];
    if (!schema || !v.safeParse(schema, data).success) {
      throw new TypeError(`Invalid payload for window channel message "${type}"`);
    }
    if (options.requireAck && !options.recipientId) {
      throw new TypeError("Acknowledged messages require a recipientId");
    }

    const envelope = this.createEnvelope(type, data, options);
    this.postEnvelope(envelope);
    return options.requireAck
      ? this.waitForAcknowledgment(envelope, options)
      : Promise.resolve();
  }

  sendDirect<K extends keyof TSchemas & string>(
    recipientId: string,
    type: K,
    data: v.InferOutput<TSchemas[K]>,
    options: Omit<SendOptions, "recipientId"> = {},
  ) {
    return this.broadcast(type, data, { ...options, recipientId });
  }

  subscribe(listener: (message: WindowChannelMessageFor<TSchemas>) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private handleBroadcastMessage = (event: MessageEvent<unknown>) => {
    this.handleMessage(event.data);
  };

  private handleMessage = (value: unknown) => {
    const parsedMessage = v.safeParse(EnvelopeSchema, value);
    if (!parsedMessage.success) return;

    const message = parsedMessage.output;
    if (
      message.rootId !== this.rootId ||
      message.senderId === this.windowId ||
      (message.recipientId && message.recipientId !== this.windowId)
    ) return;

    const dataSchema = isRegistryMessage(message.type)
      ? RegistrySchemas[message.type]
      : this.schemas[message.type];
    const parsedData = dataSchema && v.safeParse(dataSchema, message.data);
    if (!parsedData || !parsedData.success) return;

    if (message.type === RegistryType.Unregister) {
      this.removePeer(message.senderId, message.senderSessionId);
      return;
    }

    this.touchPeer(message.senderId, message.senderSessionId);
    if (message.type === RegistryType.Ack) {
      this.receiveAcknowledgment(parsedData.output as { messageId: string });
      return;
    }

    if (this.seenMessageIds.has(message.messageId)) {
      if (message.acknowledgmentRequested) this.acknowledge(message);
      return;
    }
    this.seenMessageIds.add(message.messageId);
    if (this.seenMessageIds.size > 2_000) {
      this.seenMessageIds.delete(this.seenMessageIds.values().next().value!);
    }

    if (isRegistryMessage(message.type)) {
      this.handleRegistryMessage(message, parsedData.output);
    } else {
      if (!this.ready()) return;
      this.listeners.forEach((listener) =>
        listener(message as WindowChannelMessageFor<TSchemas>),
      );
    }
    if (message.acknowledgmentRequested) this.acknowledge(message);
  };

  private handleRegistryMessage(message: WindowChannelMessage, data: unknown) {
    switch (message.type as RegistryMessageType) {
      case RegistryType.Register: {
        const registration = data as v.InferOutput<typeof RegisterSchema>;
        if (this.coordinatorId() !== this.windowId) break;
        if (registration.schemaVersion !== this.schemaVersion) {
          this.sendRegistryMessage(
            RegistryType.Rejected,
            {
              reason: `Schema version ${registration.schemaVersion} is incompatible with ${this.schemaVersion}`,
            },
            message.senderId,
          );
        } else {
          this.sendSnapshot(message.senderId);
        }
        break;
      }
      case RegistryType.Rejected:
        this.setError((data as v.InferOutput<typeof RejectedSchema>).reason);
        this.setReady(false);
        break;
      case RegistryType.Unregister:
        break;
      case RegistryType.Heartbeat: {
        const heartbeat = data as v.InferOutput<typeof HeartbeatSchema>;
        const advertisedCoordinator = heartbeat.coordinatorId;
        const advertisedIsActive =
          advertisedCoordinator === message.senderId ||
          advertisedCoordinator === this.windowId ||
          this.peerRecords.has(advertisedCoordinator);
        if (!advertisedIsActive) break;

        const currentCoordinator = this.coordinatorId();
        const currentIsActive =
          currentCoordinator === this.windowId ||
          this.peerRecords.has(currentCoordinator);
        if (
          advertisedCoordinator === this.rootId ||
          !currentIsActive ||
          (currentCoordinator !== this.rootId &&
            advertisedCoordinator < currentCoordinator)
        ) this.setCoordinatorId(advertisedCoordinator);
        break;
      }
      case RegistryType.Snapshot:
        this.applySnapshot(data as v.InferOutput<typeof SnapshotSchema>);
        break;
      case RegistryType.Ready:
      case RegistryType.Ack:
        break;
    }
  }

  private sendSnapshot(recipientId: string) {
    if (!this.state) {
      this.sendRegistryMessage(
        RegistryType.Ready,
        { schemaVersion: this.schemaVersion },
        recipientId,
      );
      return;
    }

    const state = this.state.getSnapshot();
    if (!v.safeParse(this.state.schema, state).success) {
      throw new TypeError("Current window channel state does not match its schema");
    }
    this.sendRegistryMessage(
      RegistryType.Snapshot,
      { schemaVersion: this.schemaVersion, state },
      recipientId,
    );
  }

  private applySnapshot(snapshot: v.InferOutput<typeof SnapshotSchema>) {
    if (
      snapshot.schemaVersion !== this.schemaVersion ||
      !this.state ||
      !v.safeParse(this.state.schema, snapshot.state).success
    ) return;

    this.state.applySnapshot(snapshot.state);
    this.setError(undefined);
    this.setReady(true);
    this.sendRegistryMessage(
      RegistryType.Ready,
      { schemaVersion: this.schemaVersion },
      this.coordinatorId(),
    );
  }

  private sendHeartbeat = () => {
    if (!this.connected) return;
    this.expirePeers();
    this.sendRegistryMessage(RegistryType.Heartbeat, {
      coordinatorId: this.coordinatorId(),
    });
  };

  private touchPeer(windowId: string, sessionId: string) {
    const peer = this.peerRecords.get(windowId);
    if (!peer || peer.sessionId !== sessionId) {
      this.peerRecords.set(windowId, { sessionId, lastSeen: Date.now() });
      this.syncPeers();
      return;
    }
    peer.lastSeen = Date.now();
  }

  private removePeer(windowId: string, sessionId: string) {
    const peer = this.peerRecords.get(windowId);
    if (!peer || peer.sessionId !== sessionId) return;
    this.peerRecords.delete(windowId);
    this.directPorts.get(windowId)?.close();
    this.directPorts.delete(windowId);
    this.syncPeers();
    this.electCoordinator();
  }

  private expirePeers() {
    const cutoff = Date.now() - this.peerTimeoutMs;
    let changed = false;
    this.peerRecords.forEach((peer, windowId) => {
      if (peer.lastSeen >= cutoff) return;
      this.peerRecords.delete(windowId);
      this.directPorts.get(windowId)?.close();
      this.directPorts.delete(windowId);
      changed = true;
    });
    if (changed) this.syncPeers();
    this.electCoordinator();
  }

  private syncPeers() {
    this.setPeers([...this.peerRecords.keys()].sort());
  }

  private electCoordinator() {
    const currentCoordinator = this.coordinatorId();
    if (currentCoordinator === this.windowId || this.peerRecords.has(currentCoordinator)) return;

    const nextCoordinator = [this.windowId, ...this.peerRecords.keys()].sort()[0];
    this.setCoordinatorId(nextCoordinator);
    if (nextCoordinator === this.windowId) {
      this.setReady(true);
      if (this.connected) {
        this.sendRegistryMessage(RegistryType.Heartbeat, {
          coordinatorId: nextCoordinator,
        });
      }
    }
  }

  private createEnvelope(type: string, data: unknown, options: SendOptions = {}): WindowChannelMessage {
    return {
      type,
      senderId: this.windowId,
      senderSessionId: this.sessionId,
      rootId: this.rootId,
      sentAt: new Date().toISOString(),
      messageId: crypto.randomUUID(),
      recipientId: options.recipientId,
      acknowledgmentRequested: options.requireAck || undefined,
      data,
    };
  }

  private sendRegistryMessage(type: RegistryMessageType, data: unknown, recipientId?: string) {
    this.postEnvelope(this.createEnvelope(type, data, { recipientId }));
  }

  private postEnvelope(envelope: WindowChannelMessage) {
    if (!this.connected || !this.channel) throw new Error("Window channel is not connected");

    const directPort = envelope.recipientId
      ? this.directPorts.get(envelope.recipientId)
      : undefined;
    if (directPort) directPort.postMessage(envelope);
    else this.channel.postMessage(envelope);
  }

  private waitForAcknowledgment(envelope: WindowChannelMessage, options: SendOptions) {
    return new Promise<void>((resolve, reject) => {
      const pending: PendingAcknowledgment = {
        envelope,
        attemptsRemaining: options.retries ?? this.defaultAckRetries,
        timeoutMs: options.ackTimeoutMs ?? this.defaultAckTimeoutMs,
        resolve,
        reject,
      };
      this.pendingAcknowledgments.set(envelope.messageId, pending);
      this.scheduleRetry(envelope.messageId, pending);
    });
  }

  private scheduleRetry(messageId: string, pending: PendingAcknowledgment) {
    pending.timer = setTimeout(() => {
      if (pending.attemptsRemaining > 0) {
        pending.attemptsRemaining -= 1;
        this.postEnvelope(pending.envelope);
        this.scheduleRetry(messageId, pending);
        return;
      }
      this.pendingAcknowledgments.delete(messageId);
      pending.reject(new Error(`Message ${messageId} was not acknowledged`));
    }, pending.timeoutMs);
  }

  private acknowledge(message: WindowChannelMessage) {
    this.sendRegistryMessage(RegistryType.Ack, { messageId: message.messageId }, message.senderId);
  }

  private receiveAcknowledgment(acknowledgment: { messageId: string }) {
    const pending = this.pendingAcknowledgments.get(acknowledgment.messageId);
    if (!pending) return;
    if (pending.timer) clearTimeout(pending.timer);
    this.pendingAcknowledgments.delete(acknowledgment.messageId);
    pending.resolve();
  }

  private requestDirectConnection() {
    if (!window.opener) return;

    const directChannel = new MessageChannel();
    directChannel.port1.addEventListener("message", this.handleDirectMessage);
    directChannel.port1.start();
    window.opener.postMessage(
      {
        kind: DIRECT_MESSAGE_KIND,
        rootId: this.rootId,
        senderId: this.windowId,
        senderSessionId: this.sessionId,
      },
      window.location.origin,
      [directChannel.port2],
    );
  }

  private handleWindowMessage = (event: MessageEvent<unknown>) => {
    if (event.origin !== window.location.origin || event.ports.length !== 1) return;

    const request = v.safeParse(DirectRequestSchema, event.data);
    if (!request.success || request.output.rootId !== this.rootId) return;

    const port = event.ports[0];
    this.attachDirectPort(request.output.senderId, port);
    port.postMessage({
      kind: DIRECT_MESSAGE_KIND,
      senderId: this.windowId,
    } satisfies v.InferOutput<typeof DirectAcceptSchema>);
  };

  private handleDirectMessage = (event: MessageEvent<unknown>) => {
    const accepted = v.safeParse(DirectAcceptSchema, event.data);
    if (accepted.success) {
      this.attachDirectPort(accepted.output.senderId, event.currentTarget as MessagePort);
      return;
    }
    this.handleMessage(event.data);
  };

  private attachDirectPort(windowId: string, port: MessagePort) {
    this.directPorts.get(windowId)?.close();
    this.directPorts.set(windowId, port);
    port.addEventListener("message", this.handleDirectMessage);
    port.start();
  }
}