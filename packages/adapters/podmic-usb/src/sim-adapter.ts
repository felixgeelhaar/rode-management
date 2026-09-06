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
  initialMonitorPercent?: number;
  /** Simulated gain range — provisional until protocol validation. */
  minGainDb?: number;
  maxGainDb?: number;
  stepDb?: number;
}

type NumericCapabilityId = "gain" | "monitor-level";
type BooleanCapabilityId = "mute" | "high-pass" | "compressor";
type CapabilityId = NumericCapabilityId | BooleanCapabilityId;

/**
 * In-process PodMic USB simulator for Phase 0–2 architecture validation.
 *
 * Deliberately not a reverse-engineered protocol implementation.
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
  private monitorPercent: number;
  private muted = false;
  private highPass = false;
  private compressor = false;

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
    this.monitorPercent = options.initialMonitorPercent ?? 65;
  }

  async start(): Promise<void> {
    this.started = true;
    this.online = true;
    this.device = this.buildDevice();
    this.emitDevices();
    this.emitAll("reconciliation");
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
    if (deviceId !== this.deviceId) {
      return undefined;
    }
    return this.stateFor(capabilityId as CapabilityId, this.online ? "hardware" : "reconciliation");
  }

  async setCapabilityValue(
    deviceId: string,
    capabilityId: string,
    value: number | boolean | string,
    source: StateSource,
  ): Promise<CapabilityState> {
    this.assertOnline(deviceId);
    const id = capabilityId as CapabilityId;
    this.writeValue(id, value);
    const state = this.stateFor(id, source);
    if (!state) {
      throw new Error(`Unsupported capability: ${capabilityId}`);
    }
    this.emitState(id, state);
    return state;
  }

  async adjustCapabilityValue(
    deviceId: string,
    capabilityId: string,
    delta: number,
    source: StateSource,
  ): Promise<CapabilityState> {
    if (capabilityId === "gain") {
      return this.setCapabilityValue(
        deviceId,
        capabilityId,
        this.gainDb + delta * this.stepDb,
        source,
      );
    }
    if (capabilityId === "monitor-level") {
      return this.setCapabilityValue(
        deviceId,
        capabilityId,
        this.monitorPercent + delta,
        source,
      );
    }
    throw new Error(`Capability ${capabilityId} does not support relative adjust`);
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
    this.emitAll("reconciliation");
  }

  simulateExternalGainChange(gainDb: number): void {
    this.assertOnline(this.deviceId);
    this.gainDb = this.clampGain(gainDb);
    this.emitState("gain", this.stateFor("gain", "hardware")!);
  }

  simulateExternalMute(muted: boolean): void {
    this.assertOnline(this.deviceId);
    this.muted = muted;
    this.emitState("mute", this.stateFor("mute", "hardware")!);
  }

  getGainDb(): number {
    return this.gainDb;
  }

  getMonitorPercent(): number {
    return this.monitorPercent;
  }

  isMuted(): boolean {
    return this.muted;
  }

  isHighPassEnabled(): boolean {
    return this.highPass;
  }

  isCompressorEnabled(): boolean {
    return this.compressor;
  }

  isOnline(): boolean {
    return this.online;
  }

  private writeValue(id: CapabilityId, value: number | boolean | string): void {
    switch (id) {
      case "gain":
        if (typeof value !== "number") throw new Error("Gain requires a number");
        this.gainDb = this.clampGain(value);
        return;
      case "monitor-level":
        if (typeof value !== "number") throw new Error("Monitor requires a number");
        this.monitorPercent = Math.max(0, Math.min(100, Math.round(value)));
        return;
      case "mute":
        if (typeof value !== "boolean") throw new Error("Mute requires a boolean");
        this.muted = value;
        return;
      case "high-pass":
        if (typeof value !== "boolean") throw new Error("High-pass requires a boolean");
        this.highPass = value;
        return;
      case "compressor":
        if (typeof value !== "boolean") throw new Error("Compressor requires a boolean");
        this.compressor = value;
        return;
      default:
        throw new Error(`Unsupported capability: ${id}`);
    }
  }

  private stateFor(
    id: CapabilityId,
    source: StateSource,
  ): CapabilityState | undefined {
    const availability = this.online ? "available" : "offline";
    const timestamp = Date.now();
    switch (id) {
      case "gain":
        return { capabilityId: id, value: this.gainDb, availability, timestamp, source };
      case "monitor-level":
        return {
          capabilityId: id,
          value: this.monitorPercent,
          availability,
          timestamp,
          source,
        };
      case "mute":
        return { capabilityId: id, value: this.muted, availability, timestamp, source };
      case "high-pass":
        return { capabilityId: id, value: this.highPass, availability, timestamp, source };
      case "compressor":
        return {
          capabilityId: id,
          value: this.compressor,
          availability,
          timestamp,
          source,
        };
      default:
        return undefined;
    }
  }

  private assertOnline(deviceId: string): void {
    if (!this.online) {
      throw new Error("PodMic USB is offline");
    }
    if (deviceId !== this.deviceId) {
      throw new Error(`Unknown device: ${deviceId}`);
    }
  }

  private clampGain(value: number): number {
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
      firmware: "sim-0.2.0",
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
              metadata: { supportTier: "sim" },
            },
            {
              id: "monitor-level",
              type: "Monitoring",
              readable: true,
              writable: true,
              observable: true,
              valueType: "number",
              unit: "%",
              minimum: 0,
              maximum: 100,
              step: 1,
              metadata: { supportTier: "sim" },
            },
            {
              id: "mute",
              type: "Mute",
              readable: true,
              writable: true,
              observable: true,
              valueType: "boolean",
              metadata: { supportTier: "sim" },
            },
            {
              id: "high-pass",
              type: "HighPassFilter",
              readable: true,
              writable: true,
              observable: true,
              valueType: "boolean",
              metadata: { supportTier: "sim" },
            },
            {
              id: "compressor",
              type: "Compression",
              readable: true,
              writable: true,
              observable: true,
              valueType: "boolean",
              metadata: { supportTier: "sim" },
            },
          ],
        },
      ],
    };
  }

  private emitAll(source: StateSource): void {
    for (const id of [
      "gain",
      "monitor-level",
      "mute",
      "high-pass",
      "compressor",
    ] as CapabilityId[]) {
      const state = this.stateFor(id, source);
      if (state) {
        this.emitState(id, state);
      }
    }
  }

  private emitState(capabilityId: string, state: CapabilityState): void {
    for (const listener of this.stateListeners) {
      listener({ deviceId: this.deviceId, capabilityId, state });
    }
  }

  private emitDevices(): void {
    const devices = this.listDevices();
    for (const listener of this.deviceListeners) {
      listener(devices);
    }
  }
}
