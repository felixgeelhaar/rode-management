/**
 * Dual-adapter topology demo: PodMic USB sim + RØDECaster Duo sim together.
 *
 * Proves "My Mic" / Gain prefers mixer ownership when both advertise PodMic,
 * while mix bank levels still come from the Duo.
 */

import { CapabilityCore, createMicGainBinding, createBinding } from "@rode-control/core";
import { PodMicUsbSimAdapter } from "@rode-control/adapter-podmic-usb";
import { RodecasterDuoSimAdapter } from "./sim-adapter.js";

async function main(): Promise<void> {
  const usb = new PodMicUsbSimAdapter({ initialGainDb: 24 });
  const mixer = new RodecasterDuoSimAdapter();
  const core = new CapabilityCore({ preferMixerOwnership: true });

  core.registerAdapter(usb);
  core.registerAdapter(mixer);
  await core.start();

  const devices = core.listDevices();
  console.log(
    "Devices:",
    devices.map((d) => `${d.model} [${d.family}] ${d.status}`),
  );

  const usbMic = devices
    .find((d) => d.family === "digital-microphone")
    ?.endpoints.find((e) => e.kind === "microphone");
  const mixerInput = devices
    .find((d) => d.family === "rodecaster")
    ?.endpoints.find((e) => e.source === "PodMic");

  if (usbMic && mixerInput) {
    core.setTopology({
      edges: [{ from: usbMic.id, to: mixerInput.id, relation: "feeds" }],
    });
    console.log(`Topology: ${usbMic.id} feeds ${mixerInput.id}`);
  }

  core.upsertBinding(
    createMicGainBinding({
      id: "my-mic-gain",
      label: "MIC",
      sourceHint: "PodMic",
    }),
  );
  core.upsertBinding(
    createBinding("game-level", "GAME", "Level", { sourceHint: "Game" }),
  );

  const mic = core.resolveBinding("my-mic-gain");
  console.log("MIC gain owner:", {
    device: mic?.device.model,
    family: mic?.device.family,
    endpoint: mic?.endpoint.label,
    kind: mic?.endpoint.kind,
    value: core.getControlSurface("my-mic-gain").valueText,
  });

  console.log("GAME level:", core.getControlSurface("game-level"));

  await core.execute({ type: "AdjustGain", bindingId: "my-mic-gain", delta: 2 });
  console.log("After +2 dB:", core.getControlSurface("my-mic-gain"));

  await core.stop();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
