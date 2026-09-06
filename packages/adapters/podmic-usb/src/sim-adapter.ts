import type {
  CapabilityState,
  Device,
  DeviceAdapter,
  StateSource,
} from "@rode-control/core";

export interface PodMicUsbSimOptions {
  deviceId?: string;
  serial?: string;
  initialGainDb?: number;
  /** Simulated gain range — provisional until protocol validation. */
  minGainDb?: number;
  maxGainDb?: number;
  stepDb?: number;
}

/**
 * In-process PodMic USB simulator for Phase 0/1 architecture validation.
 *
 * This is deliberately not a reverse-engineered protocol implementation.
 * Real HID/USB control belongs behind the same DeviceAdapter contract once
 * protocol feasibility is proven on hardware.
 */
export class PodMicUsbSimAdapter implements DeviceAdapter {
  readonly id = "podmic-usb-sim";
  readonly family = "digital-microphone";

  private readonly deviceId: string;
  private readonly serial: string;
  private readonly minGainDb: number;
  private readonly maxGainDb: number;
  private readonly stepDb: number;

  private gainDb: number;
  private online = false;
  private started = false;
  private device: Device | undefined;

  private readonly deviceListeners = new Set<(devices: Device[]) => void>();
  private readonly stateListeners = new Set<
    (update: {
      deviceId: string;
      capabilityId: string;
      state: CapabilityState;
    }) => void
  >();

  constructor(options: PodMicUsbSimOptions = {}) {
    this.deviceId = options.deviceId ?? "podmic-usb-sim-1";
    this.serial = options.serial ?? "SIM-PODMIC-001";
    this.minGainDb = options.minGainDb ?? 0;
    this.maxGainDb = options.maxGainDb ?? 40;
    this.stepDb = options.stepDb ?? 1;
    this.gainDb = options.initialGainDb ?? 24;
  }

  async start(): Promise<void> {
    this.started = true;
    this.online = true;
    this.device = this.buildDevice();
    this.emitDevices();
    this.emitGain("reconciliation");
  }

  async stop(): Promise<void> {
    this.started = false;
    this.online = false;
    this.emitDevices();
  }

  listDevices(): Device[] {
    if (!this.started || !this.online || !this.device) {
      return [];
    }
    return [this.device];
  }

  getCapabilityState(
    deviceId: string,
    capabilityId: string,
  ): CapabilityState | undefined {
    if (deviceId !== this.deviceId || capabilityId !== "gain") {
      return undefined;
    }
    return this.gainState(this.online ? "hardware" : "reconciliation");
  }

  async setCapabilityValue(
    deviceId: string,
    capabilityId: string,
    value: number | boolean | string,
    source: StateSource,
  ): Promise<CapabilityState> {
    this.assertWritable(deviceId, capabilityId);
    if (typeof value !== "number") {
      throw new Error("Gain requires a numeric value");
    }
    this.gainDb = this.clamp(value);
    const state = this.gainState(source);
    this.emitGainState(state);
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
      this.gainDb + delta * this.stepDb,
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

  /** Simulate unplug. Bindings must remain configured in the core. */
  simulateDisconnect(): void {
    if (!this.started) {
      return;
    }
    this.online = false;
    if (this.device) {
      this.device = { ...this.device, status: "offline" };
    }
    this.emitDevices();
  }

  /** Simulate replug with identity preserved. */
  simulateReconnect(): void {
    if (!this.started) {
      return;
    }
    this.online = true;
    this.device = this.buildDevice();
    this.emitDevices();
    this.emitGain("reconciliation");
  }

  /** Simulate gain change from RØDE Central / hardware. */
  simulateExternalGainChange(gainDb: number): void {
    if (!this.online) {
      throw new Error("Cannot observe external changes while offline");
    }
    this.gainDb = this.clamp(gainDb);
    this.emitGain("hardware");
  }

  getGainDb(): number {
    return this.gainDb;
  }

  isOnline(): boolean {
    return this.online;
  }

  private assertWritable(deviceId: string, capabilityId: string): void {
    if (!this.online) {
      throw new Error("PodMic USB is offline");
    }
    if (deviceId !== this.deviceId) {
      throw new Error(`Unknown device: ${deviceId}`);
    }
    if (capabilityId !== "gain") {
      throw new Error(`Unsupported capability: ${capabilityId}`);
    }
  }

  private clamp(value: number): number {
    const stepped =
      Math.round((value - this.minGainDb) / this.stepDb) * this.stepDb +
      this.minGainDb;
    return Math.max(this.minGainDb, Math.min(this.maxGainDb, stepped));
  }

  private buildDevice(): Device {
    return {
      id: this.deviceId,
      manufacturer: "RØDE",
      family: "digital-microphone",
      model: "PodMic USB",
      serial: this.serial,
      firmware: "sim-0.1.0",
      connection: "usb",
      status: this.online ? "online" : "offline",
      endpoints: [
        {
          id: `${this.deviceId}:microphone`,
          deviceId: this.deviceId,
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
              minimum: this.minGainDb,
              maximum: this.maxGainDb,
              step: this.stepDb,
              metadata: {
                supportTier: "sim",
                note: "Range is provisional pending protocol validation",
              },
            },
            {
              id: "monitor-level",
              type: "Monitoring",
              readable: true,
              writable: true,
              observable: false,
              valueType: "number",
              unit: "%",
              minimum: 0,
              maximum: 100,
              step: 1,
              metadata: {
                supportTier: "sim-stub",
                note: "Declared for Phase 2 depth; not wired in vertical slice",
              },
            },
          ],
        },
      ],
    };
  }

  private gainState(source: StateSource): CapabilityState {
    return {
      capabilityId: "gain",
      value: this.gainDb,
      availability: this.online ? "available" : "offline",
      timestamp: Date.now(),
      source,
    };
  }

  private emitGain(source: StateSource): void {
    this.emitGainState(this.gainState(source));
  }

  private emitGainState(state: CapabilityState): void {
    for (const listener of this.stateListeners) {
      listener({
        deviceId: this.deviceId,
        capabilityId: "gain",
        state,
      });
    }
  }

  private emitDevices(): void {
    const devices = this.listDevices();
    for (const listener of this.deviceListeners) {
      listener(devices);
    }
  }
}
