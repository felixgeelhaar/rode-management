import type {
  CapabilityDescriptor,
  CapabilityState,
  CapabilityType,
  Device,
  DeviceAdapter,
  Endpoint,
  EndpointKind,
  StateSource,
  ValueType,
} from "@rode-control/core";

export interface RodecasterDuoSimOptions {
  deviceId?: string;
  serial?: string;
}

interface ChannelState {
  id: string;
  label: string;
  source: string;
  kind: EndpointKind;
  level: number;
  muted: boolean;
  /** Input gain — only meaningful for hardware mic inputs. */
  gain?: number;
}

/**
 * RØDECaster Duo simulator for Phase 3 ownership / multi-source validation.
 *
 * Models mixer-owned channels (Mic / Game / Chat / Music) plus headphones.
 * Architecture fixture only — not a reverse-engineered RØDECaster protocol.
 */
export class RodecasterDuoSimAdapter implements DeviceAdapter {
  readonly id = "rodecaster-duo-sim";
  readonly family = "rodecaster";

  private readonly deviceId: string;
  private readonly serial: string;
  private online = false;
  private started = false;
  private device: Device | undefined;
  private headphoneLevel = 70;
  private channels: ChannelState[];

  private readonly deviceListeners = new Set<(devices: Device[]) => void>();
  private readonly stateListeners = new Set<
    (update: {
      deviceId: string;
      capabilityId: string;
      state: CapabilityState;
    }) => void
  >();

  constructor(options: RodecasterDuoSimOptions = {}) {
    this.deviceId = options.deviceId ?? "rodecaster-duo-sim-1";
    this.serial = options.serial ?? "SIM-DUO-001";
    this.channels = [
      {
        id: "input-1",
        label: "Input 1",
        source: "PodMic",
        kind: "channel",
        level: -8,
        muted: false,
        gain: 48,
      },
      {
        id: "game",
        label: "Game",
        source: "Game",
        kind: "virtual-source",
        level: -10,
        muted: false,
      },
      {
        id: "chat",
        label: "Chat",
        source: "Discord",
        kind: "virtual-source",
        level: -14,
        muted: false,
      },
      {
        id: "music",
        label: "Music",
        source: "Music",
        kind: "virtual-source",
        level: -18,
        muted: false,
      },
    ];
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
    return this.stateFor(capabilityId, this.online ? "hardware" : "reconciliation");
  }

  async setCapabilityValue(
    deviceId: string,
    capabilityId: string,
    value: number | boolean | string,
    source: StateSource,
  ): Promise<CapabilityState> {
    this.assertOnline(deviceId);
    this.write(capabilityId, value);
    const state = this.stateFor(capabilityId, source);
    if (!state) {
      throw new Error(`Unsupported capability: ${capabilityId}`);
    }
    this.emitState(capabilityId, state);
    return state;
  }

  async adjustCapabilityValue(
    deviceId: string,
    capabilityId: string,
    delta: number,
    source: StateSource,
  ): Promise<CapabilityState> {
    const current = this.stateFor(capabilityId, source)?.value;
    if (typeof current !== "number") {
      throw new Error(`Capability ${capabilityId} does not support relative adjust`);
    }
    return this.setCapabilityValue(deviceId, capabilityId, current + delta, source);
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

  simulateDisconnect(): void {
    if (!this.started) return;
    this.online = false;
    if (this.device) {
      this.device = { ...this.device, status: "offline" };
    }
    this.emitDevices();
  }

  simulateReconnect(): void {
    if (!this.started) return;
    this.online = true;
    this.device = this.buildDevice();
    this.emitDevices();
    this.emitAll("reconciliation");
  }

  /** Simulate a physical fader move on the mixer. */
  simulateExternalLevel(channelId: string, levelDb: number): void {
    this.assertOnline(this.deviceId);
    const channel = this.channels.find((c) => c.id === channelId);
    if (!channel) {
      throw new Error(`Unknown channel: ${channelId}`);
    }
    channel.level = clamp(levelDb, -60, 10, 1);
    const capabilityId = `${channelId}:level`;
    this.emitState(capabilityId, this.stateFor(capabilityId, "hardware")!);
  }

  getChannelLevel(channelId: string): number | undefined {
    return this.channels.find((c) => c.id === channelId)?.level;
  }

  isOnline(): boolean {
    return this.online;
  }

  private write(capabilityId: string, value: number | boolean | string): void {
    if (capabilityId === "headphones:level") {
      if (typeof value !== "number") throw new Error("Headphone level requires a number");
      this.headphoneLevel = clamp(value, 0, 100, 1);
      return;
    }

    const [channelId, field] = capabilityId.split(":");
    const channel = this.channels.find((c) => c.id === channelId);
    if (!channel || !field) {
      throw new Error(`Unsupported capability: ${capabilityId}`);
    }

    if (field === "level") {
      if (typeof value !== "number") throw new Error("Level requires a number");
      channel.level = clamp(value, -60, 10, 1);
      return;
    }
    if (field === "mute") {
      if (typeof value !== "boolean") throw new Error("Mute requires a boolean");
      channel.muted = value;
      return;
    }
    if (field === "gain") {
      if (typeof value !== "number") throw new Error("Gain requires a number");
      if (channel.gain === undefined) {
        throw new Error(`Channel ${channelId} has no gain`);
      }
      channel.gain = clamp(value, 0, 76, 1);
      return;
    }

    throw new Error(`Unsupported capability: ${capabilityId}`);
  }

  private stateFor(
    capabilityId: string,
    source: StateSource,
  ): CapabilityState | undefined {
    const availability = this.online ? "available" : "offline";
    const timestamp = Date.now();

    if (capabilityId === "headphones:level") {
      return {
        capabilityId,
        value: this.headphoneLevel,
        availability,
        timestamp,
        source,
      };
    }

    const [channelId, field] = capabilityId.split(":");
    const channel = this.channels.find((c) => c.id === channelId);
    if (!channel || !field) {
      return undefined;
    }

    if (field === "level") {
      return { capabilityId, value: channel.level, availability, timestamp, source };
    }
    if (field === "mute") {
      return { capabilityId, value: channel.muted, availability, timestamp, source };
    }
    if (field === "gain" && channel.gain !== undefined) {
      return { capabilityId, value: channel.gain, availability, timestamp, source };
    }
    return undefined;
  }

  private buildDevice(): Device {
    const endpoints: Endpoint[] = this.channels.map((channel) => {
      const capabilities: CapabilityDescriptor[] = [
        numericCapability(`${channel.id}:level`, "Level", "dB", -60, 10, 1),
        booleanCapability(`${channel.id}:mute`, "Mute"),
      ];
      if (channel.gain !== undefined) {
        capabilities.unshift(
          numericCapability(`${channel.id}:gain`, "Gain", "dB", 0, 76, 1),
        );
      }
      return {
        id: `${this.deviceId}:${channel.id}`,
        deviceId: this.deviceId,
        kind: channel.kind,
        label: channel.label,
        source: channel.source,
        capabilities,
      };
    });

    endpoints.push({
      id: `${this.deviceId}:headphones`,
      deviceId: this.deviceId,
      kind: "headphone",
      label: "Headphones",
      source: "Headphones",
      capabilities: [
        numericCapability("headphones:level", "Level", "%", 0, 100, 1),
      ],
    });

    return {
      id: this.deviceId,
      manufacturer: "RØDE",
      family: "rodecaster",
      model: "RØDECaster Duo",
      serial: this.serial,
      firmware: "sim-0.1.0",
      connection: "usb",
      status: this.online ? "online" : "offline",
      endpoints,
    };
  }

  private assertOnline(deviceId: string): void {
    if (!this.online) {
      throw new Error("RØDECaster Duo is offline");
    }
    if (deviceId !== this.deviceId) {
      throw new Error(`Unknown device: ${deviceId}`);
    }
  }

  private emitAll(source: StateSource): void {
    for (const channel of this.channels) {
      for (const field of channel.gain !== undefined
        ? ["gain", "level", "mute"]
        : ["level", "mute"]) {
        const capabilityId = `${channel.id}:${field}`;
        const state = this.stateFor(capabilityId, source);
        if (state) this.emitState(capabilityId, state);
      }
    }
    const hp = this.stateFor("headphones:level", source);
    if (hp) this.emitState("headphones:level", hp);
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

function numericCapability(
  id: string,
  type: CapabilityType,
  unit: string,
  minimum: number,
  maximum: number,
  step: number,
): CapabilityDescriptor {
  return {
    id,
    type,
    readable: true,
    writable: true,
    observable: true,
    valueType: "number" as ValueType,
    unit,
    minimum,
    maximum,
    step,
    metadata: { supportTier: "sim" },
  };
}

function booleanCapability(
  id: string,
  type: CapabilityType,
): CapabilityDescriptor {
  return {
    id,
    type,
    readable: true,
    writable: true,
    observable: true,
    valueType: "boolean" as ValueType,
    metadata: { supportTier: "sim" },
  };
}

function clamp(value: number, min: number, max: number, step: number): number {
  const stepped = Math.round((value - min) / step) * step + min;
  return Math.max(min, Math.min(max, Number(stepped.toFixed(6))));
}
