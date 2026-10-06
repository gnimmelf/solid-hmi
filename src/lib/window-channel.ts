import { createSignal, type Accessor } from "solid-js";

const ROOT_ID_PARAM = "rootId";
const WINDOW_ID_PARAM = "uuid";

type RegistryMessageType = "register" | "unregister";

export type WindowChannelMessage<T = unknown> = {
  type: string;
  senderId: string;
  rootId: string;
  sentAt: string;
  data: T;
};

type MessageListener = (message: WindowChannelMessage) => void;

export class WindowChannelRegistry {
  readonly windowId: string;
  readonly rootId: string;
  readonly isRoot: boolean;
  readonly peers: Accessor<readonly string[]>;

  private readonly channel: BroadcastChannel;
  private readonly listeners = new Set<MessageListener>();
  private readonly setPeers: (value: string[] | ((peers: string[]) => string[])) => string[];
  private connected = false;

  constructor(channelName: string, locationUrl = window.location.href) {
    const url = new URL(locationUrl);
    const rootId = url.searchParams.get(ROOT_ID_PARAM);

    this.isRoot = rootId === null;
    this.rootId = rootId ?? crypto.randomUUID();
    this.windowId =
      url.searchParams.get(WINDOW_ID_PARAM) ?? this.rootId;
    this.channel = new BroadcastChannel(channelName);

    const [peers, setPeers] = createSignal<string[]>([]);
    this.peers = peers;
    this.setPeers = setPeers;
    this.channel.addEventListener("message", this.handleMessage);
  }

  connect = () => {
    if (this.connected) return this.disconnect;

    this.connected = true;
    window.addEventListener("pagehide", this.disconnect);
    if (!this.isRoot) this.sendRegistryMessage("register");

    return this.disconnect;
  };

  disconnect = () => {
    if (!this.connected) return;

    this.connected = false;
    window.removeEventListener("pagehide", this.disconnect);
    if (!this.isRoot) this.sendRegistryMessage("unregister");
    this.channel.removeEventListener("message", this.handleMessage);
    this.channel.close();
  };

  openChild(url = window.location.href) {
    const childUrl = new URL(url);
    childUrl.searchParams.set(ROOT_ID_PARAM, this.rootId);
    childUrl.searchParams.set(WINDOW_ID_PARAM, crypto.randomUUID());
    return window.open(childUrl, "_blank");
  }

  broadcast<T>(type: string, data: T) {
    this.channel.postMessage({
      type,
      senderId: this.windowId,
      rootId: this.rootId,
      sentAt: new Date().toISOString(),
      data,
    } satisfies WindowChannelMessage<T>);
  }

  subscribe(listener: MessageListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private handleMessage = (event: MessageEvent<unknown>) => {
    if (!isWindowChannelMessage(event.data)) return;

    const message = event.data;
    if (message.rootId !== this.rootId) return;

    if (isRegistryMessage(message.type)) {
      if (this.isRoot) {
        this.setPeers((peers) =>
          message.type === "register"
            ? peers.includes(message.senderId)
              ? peers
              : [...peers, message.senderId]
            : peers.filter((peerId) => peerId !== message.senderId),
        );
      }
      return;
    }

    this.listeners.forEach((listener) => listener(message));
  };

  private sendRegistryMessage(type: RegistryMessageType) {
    this.broadcast(type, {});
  }
}

function isRegistryMessage(type: string): type is RegistryMessageType {
  return type === "register" || type === "unregister";
}

function isWindowChannelMessage(value: unknown): value is WindowChannelMessage {
  if (typeof value !== "object" || value === null) return false;

  const message = value as Partial<WindowChannelMessage>;
  return (
    typeof message.type === "string" &&
    typeof message.senderId === "string" &&
    typeof message.rootId === "string" &&
    typeof message.sentAt === "string" &&
    "data" in message
  );
}