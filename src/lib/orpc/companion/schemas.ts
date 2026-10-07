import { z } from "zod";
import {
  AudioRouteSchema,
  DeviceRoutingSchema,
  SetAudioRoutingSchema,
} from "../../../../owy/companion/bridge/src/web/contract";

// The bridge owns the contract (owy/companion/bridge/src/web/contract.ts, zod only);
// the site re-exports it and adds reachability, since the bridge may simply be off.
export { AudioRouteSchema, SetAudioRoutingSchema };
export type AudioRoute = z.infer<typeof AudioRouteSchema>;
export type SetAudioRoutingInput = z.infer<typeof SetAudioRoutingSchema>;

export const AudioRoutingSnapshotSchema = z.object({
  reachable: z.boolean(),
  error: z.string().optional(),
  devices: z.array(DeviceRoutingSchema),
});
export type AudioRoutingSnapshot = z.infer<typeof AudioRoutingSnapshotSchema>;
