import { describe, expect, it } from "vitest";
import {
  CapabilityCore,
  createMicGainBinding,
} from "@rode-control/core";
import { PodMicUsbSimAdapter } from "../src/sim-adapter.js";
import {
  PODMIC_USB_PROTOCOL_CHECKLIST,
  PODMIC_USB_USB_IDS,
} from "../src/protocol-research.js";

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

    await core.execute({ type: "AdjustGain", bindingId: "my-mic-gain", delta: 3 });
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

  it("documents unvalidated protocol checklist", () => {
    expect(PODMIC_USB_USB_IDS.vendorId).toBe(0x19f7);
    expect(PODMIC_USB_PROTOCOL_CHECKLIST.readGain).toBe("unvalidated");
    expect(PODMIC_USB_PROTOCOL_CHECKLIST.writeGain).toBe("unvalidated");
  });
});
