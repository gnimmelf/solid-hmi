import * as v from "valibot";

import type { RegistryMessageType } from "./types";

export const DIRECT_MESSAGE_KIND = "window-channel-direct";

export const RegistryType = {
  Ack: "$ack",
  Heartbeat: "$heartbeat",
  Ready: "$ready",
  Register: "$register",
  Rejected: "$rejected",
  Snapshot: "$snapshot",
  Unregister: "$unregister",
} as const;

export const EnvelopeSchema = v.strictObject({
  type: v.string(),
  senderId: v.string(),
  senderSessionId: v.string(),
  rootId: v.string(),
  sentAt: v.string(),
  messageId: v.string(),
  recipientId: v.optional(v.string()),
  acknowledgmentRequested: v.optional(v.boolean()),
  data: v.unknown(),
});

export const RegisterSchema = v.strictObject({ schemaVersion: v.string() });
export const RejectedSchema = v.strictObject({ reason: v.string() });
export const UnregisterSchema = v.strictObject({});
export const HeartbeatSchema = v.strictObject({ coordinatorId: v.string() });
export const SnapshotSchema = v.strictObject({
  schemaVersion: v.string(),
  state: v.unknown(),
});
export const ReadySchema = v.strictObject({ schemaVersion: v.string() });
export const AckSchema = v.strictObject({ messageId: v.string() });

export const RegistrySchemas: Record<RegistryMessageType, v.GenericSchema> = {
  [RegistryType.Ack]: AckSchema,
  [RegistryType.Heartbeat]: HeartbeatSchema,
  [RegistryType.Ready]: ReadySchema,
  [RegistryType.Register]: RegisterSchema,
  [RegistryType.Rejected]: RejectedSchema,
  [RegistryType.Snapshot]: SnapshotSchema,
  [RegistryType.Unregister]: UnregisterSchema,
};

export const DirectRequestSchema = v.strictObject({
  kind: v.literal(DIRECT_MESSAGE_KIND),
  rootId: v.string(),
  senderId: v.string(),
  senderSessionId: v.string(),
});

export const DirectAcceptSchema = v.strictObject({
  kind: v.literal(DIRECT_MESSAGE_KIND),
  senderId: v.string(),
});

export function isRegistryMessage(type: string): type is RegistryMessageType {
  return Object.values(RegistryType).some((registryType) => registryType === type);
}