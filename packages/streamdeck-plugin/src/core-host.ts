import type { CapabilityCore } from "@rode-control/core";
import {
  CapabilityCore as Core,
  createMicGainBinding,
} from "@rode-control/core";
import { PodMicUsbSimAdapter } from "@rode-control/adapter-podmic-usb";

export const MIC_GAIN_BINDING_ID = "my-mic-gain";

let corePromise: Promise<CapabilityCore> | undefined;

/**
 * Hosts the capability core inside the Stream Deck plugin process.
 *
 * Development/default: PodMic USB simulator so UI work can proceed without hardware.
 * Replace with a validated protocol adapter once Phase 0 succeeds on real devices.
 *
 * RODE_CONTROL_ADAPTER=sim|none controls startup behavior.
 */
export async function getCapabilityCore(): Promise<CapabilityCore> {
  if (!corePromise) {
    corePromise = bootstrapCore();
  }
  return corePromise;
}

async function bootstrapCore(): Promise<CapabilityCore> {
  const core = new Core();
  const mode = process.env.RODE_CONTROL_ADAPTER ?? "sim";

  if (mode === "sim") {
    const adapter = new PodMicUsbSimAdapter({ initialGainDb: 24 });
    core.registerAdapter(adapter);
  }

  await core.start();
  core.upsertBinding(
    createMicGainBinding({
      id: MIC_GAIN_BINDING_ID,
      label: "MIC",
      sourceHint: "PodMic",
    }),
  );

  return core;
}
