import { describe, expect, it, vi } from "vitest";
import type { DeviceAdapter } from "../src/adapter.js";
import {
  CapabilityCore,
  createMicGainBinding,
  formatCapabilityValue,
} from "../src/capability-core.js";
import type { CapabilityState, Device, StateSource } from "../src/types.js";

class FakeMicAdapter implements DeviceAdapter {
  readonly id = "fake-mic";
  readonly family = "digital-microphone";

  private device: Device | undefined;
  private gain = 24;
  private online = true;
  private readonly deviceListeners = new Set<(devices: Device[]) => void>();
  private readonly stateListeners = new Set<
    (update: {
      deviceId: string;
      capabilityId: string;
      state: CapabilityState;
    }) => void
  >();

  async start(): Promise<void> {
    this.online = true;
    this.device = this.buildDevice();
    this.emitDevices();
  }

  async stop(): Promise<void> {
    this.online = false;
    this.emitDevices();
  }

  listDevices(): Device[] {
    return this.device && this.online ? [this.device] : [];
  }

  getCapabilityState(
    _deviceId: string,
    capabilityId: string,
  ): CapabilityState | undefined {
    if (!this.device || capabilityId !== "gain") {
      return undefined;
    }
    return {
      capabilityId: "gain",
      value: this.gain,
      availability: this.online ? "available" : "offline",
      timestamp: Date.now(),
      source: "hardware",
    };
  }

  async setCapabilityValue(
    _deviceId: string,
    capabilityId: string,
    value: number | boolean | string,
    source: StateSource,
  ): Promise<CapabilityState> {
    if (!this.online) {
      throw new Error("Device offline");
    }
    if (capabilityId !== "gain" || typeof value !== "number") {
      throw new Error("Unsupported");
    }
    this.gain = Math.max(0, Math.min(40, value));
    const state: CapabilityState = {
      capabilityId: "gain",
      value: this.gain,
      availability: "available",
      timestamp: Date.now(),
      source,
    };
    this.emitState(state);
    return state;
  }

  async adjustCapabilityValue(
    deviceId: string,
    capabilityId: string,
    delta: number,
    source: StateSource,
  ): Promise<CapabilityState> {
    return this.setCapabilityValue(
      deviceId,
      capabilityId,
      this.gain + delta,
      source,
    );
  }

  onDevicesChanged(listener: (devices: Device[]) => void): () => void {
    this.deviceListeners.add(listener);
    return () => {
      this.deviceListeners.delete(listener);
    };
  }

  onStateChanged(
    listener: (update: {
      deviceId: string;
      capabilityId: string;
      state: CapabilityState;
    }) => void,
  ): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  simulateExternalGain(value: number): void {
    this.gain = value;
    this.emitState({
      capabilityId: "gain",
      value: this.gain,
      availability: "available",
      timestamp: Date.now(),
      source: "hardware",
    });
  }

  simulateDisconnect(): void {
    this.online = false;
    this.emitDevices();
  }

  simulateReconnect(): void {
    this.online = true;
    this.device = this.buildDevice();
    this.emitDevices();
    this.emitState({
      capabilityId: "gain",
      value: this.gain,
      availability: "available",
      timestamp: Date.now(),
      source: "reconciliation",
    });
  }

  private buildDevice(): Device {
    return {
      id: "podmic-usb-sim-1",
      manufacturer: "RØDE",
      family: "digital-microphone",
      model: "PodMic USB",
      connection: "usb",
      status: this.online ? "online" : "offline",
      endpoints: [
        {
          id: "mic",
          deviceId: "podmic-usb-sim-1",
          kind: "microphone",
          label: "My Mic",
          source: "PodMic USB",
          capabilities: [
            {
              id: "gain",
              type: "Gain",
              readable: true,
              writable: true,
              observable: true,
              valueType: "number",
              unit: "dB",
              minimum: 0,
              maximum: 40,
              step: 1,
            },
          ],
        },
      ],
    };
  }

  private emitDevices(): void {
    for (const listener of this.deviceListeners) {
      listener(this.listDevices());
    }
  }

  private emitState(state: CapabilityState): void {
    for (const listener of this.stateListeners) {
      listener({
        deviceId: "podmic-usb-sim-1",
        capabilityId: "gain",
        state,
      });
    }
  }
}

function createMixerAdapter(): DeviceAdapter {
  return {
    id: "fake-rodecaster",
    family: "rodecaster",
    async start() {},
    async stop() {},
    listDevices() {
      return [
        {
          id: "rodecaster-duo-1",
          manufacturer: "RØDE",
          family: "rodecaster",
          model: "RØDECaster Duo",
          connection: "usb",
          status: "online",
          endpoints: [
            {
              id: "input-1",
              deviceId: "rodecaster-duo-1",
              kind: "channel",
              label: "Input 1",
              source: "PodMic",
              capabilities: [
                {
                  id: "input-1-gain",
                  type: "Gain",
                  readable: true,
                  writable: true,
                  observable: true,
                  valueType: "number",
                  unit: "dB",
                  minimum: 0,
                  maximum: 76,
                  step: 1,
                },
              ],
            },
          ],
        },
      ];
    },
    getCapabilityState() {
      return {
        capabilityId: "input-1-gain",
        value: 48,
        availability: "available",
        timestamp: Date.now(),
        source: "hardware",
      };
    },
    async setCapabilityValue(_deviceId, _capabilityId, value, source) {
      return {
        capabilityId: "input-1-gain",
        value,
        availability: "available",
        timestamp: Date.now(),
        source,
      };
    },
    onDevicesChanged() {
      return () => {};
    },
    onStateChanged() {
      return () => {};
    },
  };
}

describe("CapabilityCore vertical slice", () => {
  it("discovers gain, adjusts via dial intent, and reflects state", async () => {
    const adapter = new FakeMicAdapter();
    const core = new CapabilityCore();
    core.registerAdapter(adapter);
    await core.start();
    core.upsertBinding(createMicGainBinding());

    const resolved = core.resolveBinding("my-mic-gain");
    expect(resolved?.capability.type).toBe("Gain");
    expect(resolved?.state.value).toBe(24);
    expect(core.getControlSurface("my-mic-gain").valueText).toBe("24 dB");

    const result = await core.execute({
      type: "AdjustGain",
      bindingId: "my-mic-gain",
      delta: 2,
    });

    expect(result.ok).toBe(true);
    expect(result.state?.value).toBe(26);
    expect(core.getControlSurface("my-mic-gain").valueText).toBe("26 dB");
  });

  it("updates display when external hardware changes gain", async () => {
    const adapter = new FakeMicAdapter();
    const core = new CapabilityCore();
    core.registerAdapter(adapter);
    await core.start();
    core.upsertBinding(createMicGainBinding());

    const values: Array<number | boolean | string | null> = [];
    core.subscribe((event) => {
      if (event.type === "state-changed") {
        values.push(event.resolved.state.value);
      }
    });

    adapter.simulateExternalGain(30);
    expect(core.getControlSurface("my-mic-gain").valueText).toBe("30 dB");
    expect(values).toContain(30);
  });

  it("keeps binding across disconnect/reconnect without profile recreation", async () => {
    const adapter = new FakeMicAdapter();
    const core = new CapabilityCore();
    core.registerAdapter(adapter);
    await core.start();
    core.upsertBinding(createMicGainBinding());

    const offline = vi.fn();
    const online = vi.fn();
    core.subscribe((event) => {
      if (event.type === "binding-offline") offline(event);
      if (event.type === "binding-online") online(event);
    });

    adapter.simulateDisconnect();
    expect(core.getBinding("my-mic-gain")).toBeDefined();
    expect(core.getControlSurface("my-mic-gain")).toEqual({
      label: "My Mic",
      valueText: "OFFLINE",
      availability: "offline",
    });

    const failed = await core.execute({
      type: "AdjustGain",
      bindingId: "my-mic-gain",
      delta: 1,
    });
    expect(failed.ok).toBe(false);

    adapter.simulateReconnect();
    expect(core.getControlSurface("my-mic-gain").availability).toBe("available");
    expect(core.getBinding("my-mic-gain")?.label).toBe("My Mic");

    const restored = await core.execute({
      type: "SetGain",
      bindingId: "my-mic-gain",
      value: 18,
    });
    expect(restored.ok).toBe(true);
    expect(restored.state?.value).toBe(18);
    expect(offline).toHaveBeenCalled();
    expect(online).toHaveBeenCalled();
  });

  it("keeps Stream Deck semantics identical across USB mic and mixer ownership", async () => {
    const usbCore = new CapabilityCore();
    const usbAdapter = new FakeMicAdapter();
    usbCore.registerAdapter(usbAdapter);
    await usbCore.start();
    usbCore.upsertBinding(
      createMicGainBinding({
        label: "My Mic",
        sourceHint: "PodMic",
      }),
    );

    const usbSurface = usbCore.getControlSurface("my-mic-gain");
    expect(usbCore.resolveBinding("my-mic-gain")?.endpoint.kind).toBe("microphone");
    expect(usbSurface.label).toBe("My Mic");

    const mixerCore = new CapabilityCore();
    const mixerAdapter = createMixerAdapter();
    mixerCore.registerAdapter(mixerAdapter);
    await mixerCore.start();
    mixerCore.upsertBinding(
      createMicGainBinding({
        label: "My Mic",
        sourceHint: "PodMic",
      }),
    );

    const mixerResolved = mixerCore.resolveBinding("my-mic-gain");
    const mixerSurface = mixerCore.getControlSurface("my-mic-gain");

    expect(mixerResolved?.endpoint.kind).toBe("channel");
    expect(mixerResolved?.endpoint.source).toBe("PodMic");
    expect(mixerSurface.label).toBe("My Mic");
    expect(
      formatCapabilityValue(mixerResolved!.capability, mixerResolved!.state.value),
    ).toBe("48 dB");

    // Same logical control identity; only capability ownership differs.
    expect(usbSurface.label).toBe(mixerSurface.label);
  });

  it("reports unsupported (not offline) when live devices lack the capability", async () => {
    const adapter = new FakeMicAdapter();
    const core = new CapabilityCore();
    core.registerAdapter(adapter);
    await core.start();
    core.upsertBinding({
      id: "game-level",
      label: "GAME",
      capabilityType: "Level",
      sourceHint: "Game",
    });

    expect(core.resolveBinding("game-level")).toBeUndefined();
    expect(core.getControlSurface("game-level")).toEqual({
      label: "GAME",
      valueText: "N/A",
      availability: "unsupported",
    });
  });

  it("prefers mixer-owned Gain when USB mic and RØDECaster both match", async () => {
    const core = new CapabilityCore();
    const usb = new FakeMicAdapter();
    core.registerAdapter(usb);
    core.registerAdapter(createMixerAdapter());
    await core.start();

    core.setTopology({
      edges: [{ from: "mic", to: "input-1", relation: "feeds" }],
    });

    core.upsertBinding(
      createMicGainBinding({
        label: "My Mic",
        sourceHint: "PodMic",
      }),
    );

    const resolved = core.resolveBinding("my-mic-gain");
    expect(resolved?.device.family).toBe("rodecaster");
    expect(resolved?.endpoint.kind).toBe("channel");
    expect(resolved?.endpoint.id).toBe("input-1");
    expect(core.getControlSurface("my-mic-gain").valueText).toBe("48 dB");
  });

  it("coalesces rapid AdjustGain dial ticks into one adapter write", async () => {
    const adapter = new FakeMicAdapter();
    const writes: number[] = [];
    const original = adapter.setCapabilityValue.bind(adapter);
    adapter.setCapabilityValue = async (deviceId, capabilityId, value, source) => {
      writes.push(typeof value === "number" ? value : -1);
      return original(deviceId, capabilityId, value, source);
    };

    const core = new CapabilityCore({ dialCoalesceMs: 30 });
    core.registerAdapter(adapter);
    await core.start();
    core.upsertBinding(createMicGainBinding());

    const results = await Promise.all([
      core.execute({ type: "AdjustGain", bindingId: "my-mic-gain", delta: 1 }),
      core.execute({ type: "AdjustGain", bindingId: "my-mic-gain", delta: 1 }),
      core.execute({ type: "AdjustGain", bindingId: "my-mic-gain", delta: 2 }),
    ]);

    expect(results.every((r) => r.ok)).toBe(true);
    expect(writes).toEqual([28]); // 24 + 1 + 1 + 2
    expect(core.getControlSurface("my-mic-gain").valueText).toBe("28 dB");
  });
});
