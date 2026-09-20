import { describe, expect, it } from "vitest";
import {
  CapabilityCore,
  createBinding,
  createMicGainBinding,
} from "@rode-control/core";
import { PodMicUsbSimAdapter } from "./sim-adapter.js";
import {
  PODMIC_USB_PROTOCOL_CHECKLIST,
  PODMIC_USB_USB_IDS,
} from "./protocol-research.js";

describe("PodMicUsbSimAdapter", () => {
  it("satisfies Phase 1 vertical-slice behaviors", async () => {
    const adapter = new PodMicUsbSimAdapter({ initialGainDb: 20 });
    const core = new CapabilityCore();
    core.registerAdapter(adapter);
    await core.start();
    core.upsertBinding(createMicGainBinding());

    expect(core.listDevices()[0]?.model).toBe("PodMic USB");
    expect(core.resolveBinding("my-mic-gain")?.capability.type).toBe("Gain");
    expect(core.getControlSurface("my-mic-gain").valueText).toBe("20 dB");

    await core.execute({
      type: "AdjustGain",
      bindingId: "my-mic-gain",
      delta: 3,
    });
    expect(core.getControlSurface("my-mic-gain").valueText).toBe("23 dB");

    adapter.simulateExternalGainChange(10);
    expect(core.getControlSurface("my-mic-gain").valueText).toBe("10 dB");

    adapter.simulateDisconnect();
    expect(core.getControlSurface("my-mic-gain").valueText).toBe("OFFLINE");
    expect(core.getBinding("my-mic-gain")).toBeDefined();

    adapter.simulateReconnect();
    const result = await core.execute({
      type: "SetGain",
      bindingId: "my-mic-gain",
      value: 15,
    });
    expect(result.ok).toBe(true);
    expect(core.getControlSurface("my-mic-gain").valueText).toBe("15 dB");
  });

  it("supports Phase 2 monitor / mute / processing depth", async () => {
    const adapter = new PodMicUsbSimAdapter({
      initialGainDb: 22,
      initialMonitorPercent: 40,
    });
    const core = new CapabilityCore();
    core.registerAdapter(adapter);
    await core.start();

    core.upsertBinding(createMicGainBinding());
    core.upsertBinding(
      createBinding("my-mic-monitor", "MONITOR", "Monitoring", {
        sourceHint: "PodMic",
      }),
    );
    core.upsertBinding(
      createBinding("my-mic-hpf", "HPF", "HighPassFilter", {
        sourceHint: "PodMic",
      }),
    );
    core.upsertBinding(
      createBinding("my-mic-comp", "COMP", "Compression", {
        sourceHint: "PodMic",
      }),
    );

    await core.execute({
      type: "AdjustLevel",
      bindingId: "my-mic-monitor",
      delta: 5,
    });
    expect(adapter.getMonitorPercent()).toBe(45);
    expect(core.getControlSurface("my-mic-monitor").valueText).toBe("45 %");

    const mute = await core.execute({
      type: "ToggleMute",
      bindingId: "my-mic-gain",
    });
    expect(mute.ok).toBe(true);
    expect(mute.resolved?.capability.type).toBe("Mute");
    expect(adapter.isMuted()).toBe(true);

    await core.execute({
      type: "SetProcessing",
      bindingId: "my-mic-hpf",
      capabilityType: "HighPassFilter",
      value: true,
    });
    expect(adapter.isHighPassEnabled()).toBe(true);

    await core.execute({
      type: "SetProcessing",
      bindingId: "my-mic-comp",
      capabilityType: "Compression",
      value: true,
    });
    expect(adapter.isCompressorEnabled()).toBe(true);
  });

  it("documents unvalidated protocol checklist", () => {
    expect(PODMIC_USB_USB_IDS.vendorId).toBe(0x19f7);
    expect(PODMIC_USB_PROTOCOL_CHECKLIST.readGain).toBe("unvalidated");
    expect(PODMIC_USB_PROTOCOL_CHECKLIST.writeGain).toBe("unvalidated");
  });
});
