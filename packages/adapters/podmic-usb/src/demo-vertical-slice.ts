/**
 * Phase 1 vertical-slice demo (no Stream Deck hardware required).
 *
 * Proves:
 * 1. discover PodMic USB (sim)
 * 2. discover Gain capability
 * 3. display current gain
 * 4. rotate dial → AdjustGain
 * 5. reflect changes
 * 6. external gain changes update display
 * 7. disconnect → OFFLINE
 * 8. reconnect restores control without recreating binding
 */

import {
  CapabilityCore,
  createMicGainBinding,
} from "@rode-control/core";
import { PodMicUsbSimAdapter } from "./sim-adapter.js";

async function main(): Promise<void> {
  const adapter = new PodMicUsbSimAdapter({ initialGainDb: 24 });
  const core = new CapabilityCore();
  core.registerAdapter(adapter);

  core.subscribe((event) => {
    if (event.type === "state-changed") {
      const surface = core.getControlSurface(event.resolved.binding.id);
      console.log(`  state → ${surface.label}: ${surface.valueText}`);
    }
    if (event.type === "binding-offline") {
      console.log(`  offline → ${event.bindingId} (${event.reason})`);
    }
    if (event.type === "binding-online") {
      console.log(`  online → ${event.bindingId}`);
    }
  });

  await core.start();
  core.upsertBinding(createMicGainBinding());

  console.log("1-3. Discovered + bound:");
  console.log("   ", core.getControlSurface("my-mic-gain"));

  console.log("4-5. Dial rotate +2:");
  await core.execute({ type: "AdjustGain", bindingId: "my-mic-gain", delta: 2 });

  console.log("6. External hardware gain → 31:");
  adapter.simulateExternalGainChange(31);

  console.log("7. Disconnect:");
  adapter.simulateDisconnect();
  console.log("   ", core.getControlSurface("my-mic-gain"));

  console.log("8. Reconnect + adjust:");
  adapter.simulateReconnect();
  await core.execute({ type: "AdjustGain", bindingId: "my-mic-gain", delta: -1 });
  console.log("   ", core.getControlSurface("my-mic-gain"));
  console.log("   binding still present:", core.getBinding("my-mic-gain")?.label);

  await core.stop();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
