import type * as v from "valibot";

import type { RegistryType } from "./schemas";

export type RegistryMessageType =
  (typeof RegistryType)[keyof typeof RegistryType];

export type WindowChannelSchemas = Record<
  string,
  v.GenericSchema<unknown, unknown>
>;

export type WindowChannelMessage<T = unknown> = {
  type: string;
  senderId: string;
  senderSessionId: string;
  rootId: string;
  sentAt: string;
  messageId: string;
  recipientId?: string;
  acknowledgmentRequested?: boolean;
  data: T;
};

export type WindowChannelMessageFor<TSchemas extends WindowChannelSchemas> = {
  [K in keyof TSchemas & string]: WindowChannelMessage<
    v.InferOutput<TSchemas[K]>
  > & { type: K };
}[keyof TSchemas & string];

export type SendOptions = {
  recipientId?: string;
  requireAck?: boolean;
  ackTimeoutMs?: number;
  retries?: number;
};

export type WindowChannelOptions<
  TSchemas extends WindowChannelSchemas = WindowChannelSchemas,
> = {
  schemas?: TSchemas;
  schemaVersion?: string;
  state?: {
    schema: v.GenericSchema<unknown, unknown>;
    getSnapshot: () => unknown;
    applySnapshot: (state: unknown) => void;
  };
  heartbeatIntervalMs?: number;
  peerTimeoutMs?: number;
  ackTimeoutMs?: number;
  ackRetries?: number;
};

export type Peer = { sessionId: string; lastSeen: number };

export type PendingAcknowledgment = {
  envelope: WindowChannelMessage;
  attemptsRemaining: number;
  timeoutMs: number;
  timer?: ReturnType<typeof setTimeout>;
  resolve: () => void;
  reject: (error: Error) => void;
};