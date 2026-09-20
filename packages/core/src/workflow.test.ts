import { describe, expect, it } from "vitest";
import {
  CapabilityCore,
  createBinding,
  createMicGainBinding,
  createWorkflowProfile,
  parseWorkflowProfiles,
} from "./index.js";
import type { DeviceAdapter } from "./adapter.js";
import type { CapabilityState, Device, StateSource } from "./types.js";

class FakeMixAdapter implements DeviceAdapter {
  readonly id = "fake-mix";
  readonly family = "rodecaster";
  private gain = 40;
  private game = -10;
  private muted = false;
  private readonly deviceListeners = new Set<(devices: Device[]) => void>();
  private readonly stateListeners = new Set<
    (update: {
      deviceId: string;
      capabilityId: string;
      state: CapabilityState;
    }) => void
  >();

  async start(): Promise<void> {
    this.emitDevices();
  }
  async stop(): Promise<void> {}
  listDevices(): Device[] {
    return [
      {
        id: "mix-1",
        manufacturer: "RØDE",
        family: "rodecaster",
        model: "Fake Duo",
        connection: "usb",
        status: "online",
        endpoints: [
          {
            id: "input-1",
            deviceId: "mix-1",
            kind: "channel",
            label: "Input 1",
            source: "PodMic",
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
                maximum: 76,
                step: 1,
              },
              {
                id: "mute",
                type: "Mute",
                readable: true,
                writable: true,
                observable: true,
                valueType: "boolean",
              },
            ],
          },
          {
            id: "game",
            deviceId: "mix-1",
            kind: "virtual-source",
            label: "Game",
            source: "Game",
            capabilities: [
              {
                id: "level",
                type: "Level",
                readable: true,
                writable: true,
                observable: true,
                valueType: "number",
                unit: "dB",
                minimum: -60,
                maximum: 10,
                step: 1,
              },
            ],
          },
        ],
      },
    ];
  }
  getCapabilityState(deviceId: string, capabilityId: string) {
    if (deviceId !== "mix-1") return undefined;
    if (capabilityId === "gain") {
      return this.state("gain", this.gain);
    }
    if (capabilityId === "mute") {
      return this.state("mute", this.muted);
    }
    if (capabilityId === "level") {
      return this.state("level", this.game);
    }
    return undefined;
  }
  async setCapabilityValue(
    _deviceId: string,
    capabilityId: string,
    value: number | boolean | string,
    source: StateSource,
  ): Promise<CapabilityState> {
    if (capabilityId === "gain" && typeof value === "number") {
      this.gain = value;
      const state = this.state("gain", this.gain, source);
      this.emit(state);
      return state;
    }
    if (capabilityId === "mute" && typeof value === "boolean") {
      this.muted = value;
      const state = this.state("mute", this.muted, source);
      this.emit(state);
      return state;
    }
    if (capabilityId === "level" && typeof value === "number") {
      this.game = value;
      const state = this.state("level", this.game, source);
      this.emit(state);
      return state;
    }
    throw new Error("unsupported");
  }
  onDevicesChanged(listener: (devices: Device[]) => void): () => void {
    this.deviceListeners.add(listener);
    return () => this.deviceListeners.delete(listener);
  }
  onStateChanged(
    listener: (update: {
      deviceId: string;
      capabilityId: string;
      state: CapabilityState;
    }) => void,
  ): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }
  private state(
    capabilityId: string,
    value: number | boolean,
    source: StateSource = "hardware",
  ): CapabilityState {
    return {
      capabilityId,
      value,
      availability: "available",
      timestamp: Date.now(),
      source,
    };
  }
  private emitDevices(): void {
    for (const listener of this.deviceListeners) listener(this.listDevices());
  }
  private emit(state: CapabilityState): void {
    for (const listener of this.stateListeners) {
      listener({ deviceId: "mix-1", capabilityId: state.capabilityId, state });
    }
  }
}

describe("workflow presets", () => {
  it("applies a multi-binding workflow via ApplyWorkflow", async () => {
    const core = new CapabilityCore({ dialCoalesceMs: 0 });
    core.registerAdapter(new FakeMixAdapter());
    await core.start();
    core.upsertBinding(
      createMicGainBinding({ label: "MIC", sourceHint: "PodMic" }),
    );
    core.upsertBinding(
      createBinding("game-level", "GAME", "Level", { sourceHint: "Game" }),
    );

    core.upsertWorkflow(
      createWorkflowProfile("streaming", "Streaming", [
        { bindingId: "my-mic-gain", value: 50 },
        { bindingId: "game-level", value: -6 },
      ]),
    );

    const result = await core.execute({
      type: "ApplyWorkflow",
      workflowId: "streaming",
    });
    expect(result.ok).toBe(true);
    expect(core.getControlSurface("my-mic-gain").valueText).toBe("50 dB");
    expect(core.getControlSurface("game-level").valueText).toBe("-6 dB");
  });

  it("captures and reapplies the current surface as a workflow", async () => {
    const core = new CapabilityCore({ dialCoalesceMs: 0 });
    core.registerAdapter(new FakeMixAdapter());
    await core.start();
    core.upsertBinding(
      createMicGainBinding({ label: "MIC", sourceHint: "PodMic" }),
    );
    await core.execute({ type: "SetGain", bindingId: "my-mic-gain", value: 33 });

    const captured = core.captureWorkflow("snapshot", "Snapshot");
    expect(captured.steps.some((s) => s.bindingId === "my-mic-gain")).toBe(true);

    await core.execute({ type: "SetGain", bindingId: "my-mic-gain", value: 10 });
    const applied = await core.applyWorkflow("snapshot");
    expect(applied.ok).toBe(true);
    expect(core.getControlSurface("my-mic-gain").valueText).toBe("33 dB");
  });

  it("parses single, array, and bundled workflow JSON", () => {
    const single = parseWorkflowProfiles(
      JSON.stringify(
        createWorkflowProfile("streaming", "Streaming", [
          { bindingId: "my-mic-gain", value: 48 },
        ]),
      ),
    );
    expect(single).toHaveLength(1);
    expect(single[0]?.id).toBe("streaming");

    const many = parseWorkflowProfiles(
      JSON.stringify([
        createWorkflowProfile("a", "A", [{ bindingId: "x", value: 1 }]),
        createWorkflowProfile("b", "B", [{ bindingId: "y", value: true }]),
      ]),
    );
    expect(many.map((w) => w.id)).toEqual(["a", "b"]);

    const bundle = parseWorkflowProfiles(
      JSON.stringify({
        workflows: [
          createWorkflowProfile("c", "C", [{ bindingId: "z", value: "ok" }]),
        ],
      }),
    );
    expect(bundle[0]?.id).toBe("c");
  });
});
