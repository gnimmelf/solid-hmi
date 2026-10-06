import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as v from "valibot";
import { WindowChannelRegistry } from "./registry";

class MemoryBroadcastChannel extends EventTarget {
  static groups = new Map<string, Set<MemoryBroadcastChannel>>();

  readonly name: string;

  constructor(name: string) {
    super();
    this.name = name;
    const group = MemoryBroadcastChannel.groups.get(name) ?? new Set();
    group.add(this);
    MemoryBroadcastChannel.groups.set(name, group);
  }

  postMessage(data: unknown) {
    MemoryBroadcastChannel.groups.get(this.name)?.forEach((channel) => {
      if (channel === this) return;
      queueMicrotask(() =>
        channel.dispatchEvent(new MessageEvent("message", { data })),
      );
    });
  }

  close() {
    MemoryBroadcastChannel.groups.get(this.name)?.delete(this);
  }

  static reset() {
    MemoryBroadcastChannel.groups.clear();
  }
}

const schemas = {
  volume: v.strictObject({ value: v.number() }),
};

function createRegistry(
  url: string,
  state: { volume: number },
  options: { heartbeatIntervalMs?: number; peerTimeoutMs?: number } = {},
) {
  return new WindowChannelRegistry("test-channel", url, {
    schemas,
    schemaVersion: "1",
    state: {
      schema: v.strictObject({ volume: v.number() }),
      getSnapshot: () => state,
      applySnapshot: (snapshot) => {
        state.volume = v.parse(v.object({ volume: v.number() }), snapshot).volume;
      },
    },
    ...options,
  });
}

function childUrl(rootId: string, windowId: string) {
  return `https://example.test/?rootId=${rootId}&uuid=${windowId}`;
}

async function deliverMessages() {
  for (let pass = 0; pass < 4; pass += 1) {
    await vi.runAllTicks();
  }
}

describe("WindowChannelRegistry", () => {
  const connected: Array<{ disconnect: () => void }> = [];

  beforeEach(() => {
    vi.useFakeTimers();
    MemoryBroadcastChannel.reset();
    vi.stubGlobal("BroadcastChannel", MemoryBroadcastChannel);
  });

  afterEach(() => {
    connected.forEach((registry) => registry.disconnect());
    connected.length = 0;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("registers a child and applies the coordinator state snapshot", async () => {
    const rootState = { volume: 45 };
    const childState = { volume: 0 };
    const root = createRegistry("https://example.test/", rootState);
    const child = createRegistry(childUrl(root.rootId, "child-a"), childState);
    connected.push(root, child);

    root.connect();
    child.connect();
    await deliverMessages();

    expect(root.peers()).toEqual(["child-a"]);
    expect(child.ready()).toBe(true);
    expect(childState.volume).toBe(45);

    const received = vi.fn();
    child.subscribe(received);
    await root.broadcast("volume", { value: 60 });
    await deliverMessages();
    expect(received).toHaveBeenCalledWith(
      expect.objectContaining({ type: "volume", data: { value: 60 } }),
    );
    expect(() =>
      root.broadcast("volume", { value: "invalid" } as never),
    ).toThrow(TypeError);
  });

  it("does not let an old document unregister a replacement session", async () => {
    const root = createRegistry("https://example.test/", { volume: 0 });
    const child = createRegistry(childUrl(root.rootId, "child-a"), { volume: 0 });
    connected.push(root, child);
    root.connect();
    child.connect();
    await deliverMessages();

    const sender = new MemoryBroadcastChannel("test-channel");
    const sendLifecycle = (type: string, sessionId: string) =>
      sender.postMessage({
        type,
        senderId: "child-a",
        senderSessionId: sessionId,
        rootId: root.rootId,
        sentAt: new Date().toISOString(),
        messageId: crypto.randomUUID(),
        data: type === "$register" ? { schemaVersion: "1" } : {},
      });

    sendLifecycle("$register", "new-session");
    await deliverMessages();
    sendLifecycle("$unregister", child.sessionId);
    await deliverMessages();

    expect(root.peers()).toEqual(["child-a"]);
    sender.close();
  });

  it("expires a peer that stops sending heartbeats", async () => {
    const root = createRegistry(
      "https://example.test/",
      { volume: 0 },
      { heartbeatIntervalMs: 100, peerTimeoutMs: 250 },
    );
    connected.push(root);
    root.connect();

    const vanishedPeer = new MemoryBroadcastChannel("test-channel");
    vanishedPeer.postMessage({
      type: "$register",
      senderId: "vanished-peer",
      senderSessionId: "vanished-session",
      rootId: root.rootId,
      sentAt: new Date().toISOString(),
      messageId: crypto.randomUUID(),
      data: { schemaVersion: "1" },
    });
    await deliverMessages();
    expect(root.peers()).toEqual(["vanished-peer"]);

    vanishedPeer.close();
    await vi.advanceTimersByTimeAsync(300);
    expect(root.peers()).toEqual([]);
  });

  it("addresses messages and resolves requested acknowledgements", async () => {
    const root = createRegistry("https://example.test/", { volume: 0 });
    const first = createRegistry(childUrl(root.rootId, "child-a"), { volume: 0 });
    const second = createRegistry(childUrl(root.rootId, "child-b"), { volume: 0 });
    connected.push(root, first, second);
    root.connect();
    first.connect();
    second.connect();
    await deliverMessages();

    const firstListener = vi.fn();
    const secondListener = vi.fn();
    first.subscribe(firstListener);
    second.subscribe(secondListener);
    const acknowledged = root.broadcast(
      "volume",
      { value: 25 },
      { recipientId: "child-a", requireAck: true },
    );
    await deliverMessages();

    await expect(acknowledged).resolves.toBeUndefined();
    expect(firstListener).toHaveBeenCalledOnce();
    expect(secondListener).not.toHaveBeenCalled();
  });

  it("elects a surviving coordinator when the root disconnects", async () => {
    const root = createRegistry("https://example.test/", { volume: 0 });
    const first = createRegistry(childUrl(root.rootId, "child-a"), { volume: 0 });
    const second = createRegistry(childUrl(root.rootId, "child-b"), { volume: 0 });
    connected.push(root, first, second);
    root.connect();
    first.connect();
    second.connect();
    await deliverMessages();

    root.disconnect();
    await deliverMessages();
    await vi.advanceTimersByTimeAsync(2_000);
    await deliverMessages();

    expect(first.coordinatorId()).toBe("child-a");
    expect(second.coordinatorId()).toBe("child-a");
  });
});