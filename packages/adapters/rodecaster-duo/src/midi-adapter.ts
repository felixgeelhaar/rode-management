import type {
  CapabilityDescriptor,
  CapabilityState,
  CapabilityType,
  Device,
  DeviceAdapter,
  Endpoint,
  StateSource,
} from "@rode-control/core";
import {
  listenAddress,
  muteAddress,
  padTriggerAddress,
  recordAddress,
  RODECASTER_DUO_MIDI_MAP,
  RODECASTER_MIDI_SUPPORT,
  RODECASTER_PRO_II_MIDI_MAP,
  type RodecasterMidiMap,
  type RodecasterModel,
} from "./midi-map.js";
import {
  MockMidiTransport,
  type MidiControlChange,
  type MidiTransport,
} from "./midi-transport.js";

export interface RodecasterDuoMidiOptions {
  deviceId?: string;
  serial?: string;
  model?: RodecasterModel;
  /**
   * Inject a transport. Defaults to {@link MockMidiTransport} so CI/dev work
   * without hardware. Pass {@link NodeMidiTransport} for a physical Duo / Pro II.
   */
  transport?: MidiTransport;
  /** When using the default mock, echo outbound CCs as inbound. */
  echoMockTraffic?: boolean;
  /**
   * RØDE official MIDI uses value `1` as a press/toggle pulse (often followed by `0`).
   * When true: outbound mute/listen/record send value 1; inbound value 1 toggles;
   * inbound value 0 is ignored. Default false (absolute) for the mock transport.
   */
  pulseToggle?: boolean;
}

interface StripState {
  muted: boolean;
  listening: boolean;
}

/**
 * Tier B RØDECaster adapter over the **official MIDI control surface**.
 *
 * First real-device path that does not require reverse engineering:
 * mute, listen, SMART pads, and record are documented by RØDE.
 *
 * Levels / gain / DSP are intentionally absent — Tier B, not Tier A.
 */
export class RodecasterDuoMidiAdapter implements DeviceAdapter {
  readonly id = "rodecaster-duo-midi";
  readonly family = "rodecaster";

  private readonly deviceId: string;
  private readonly serial: string;
  private readonly map: RodecasterMidiMap;
  private readonly transport: MidiTransport;
  private readonly pulseToggle: boolean;

  private started = false;
  private online = false;
  private device: Device | undefined;
  private recording = false;
  private readonly strips: StripState[];
  private unsubscribeTransport: (() => void) | undefined;

  private readonly deviceListeners = new Set<(devices: Device[]) => void>();
  private readonly stateListeners = new Set<
    (update: {
      deviceId: string;
      capabilityId: string;
      state: CapabilityState;
    }) => void
  >();

  constructor(options: RodecasterDuoMidiOptions = {}) {
    this.deviceId = options.deviceId ?? "rodecaster-duo-midi-1";
    this.serial = options.serial ?? "MIDI-DUO-001";
    this.map =
      options.model === "pro-ii"
        ? RODECASTER_PRO_II_MIDI_MAP
        : RODECASTER_DUO_MIDI_MAP;
    this.transport =
      options.transport ??
      new MockMidiTransport(
        "Mock RØDECaster MIDI",
        options.echoMockTraffic ?? true,
      );
    this.pulseToggle = options.pulseToggle ?? false;
    this.strips = Array.from({ length: this.map.channelCount }, () => ({
      muted: false,
      listening: false,
    }));
  }

  get support() {
    return RODECASTER_MIDI_SUPPORT;
  }

  get midiTransport(): MidiTransport {
    return this.transport;
  }

  async start(): Promise<void> {
    await this.transport.open();
    this.unsubscribeTransport = this.transport.onControlChange((message) => {
      this.handleIncoming(message);
    });
    this.started = true;
    this.online = true;
    this.device = this.buildDevice();
    this.emitDevices();
    this.emitAll("reconciliation");
  }

  async stop(): Promise<void> {
    this.unsubscribeTransport?.();
    this.unsubscribeTransport = undefined;
    this.started = false;
    this.online = false;
    this.emitDevices();
    if (this.transport.isOpen()) {
      await this.transport.close();
    }
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
    return this.stateFor(
      capabilityId,
      this.online ? "hardware" : "reconciliation",
    );
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
      throw new Error(`Unsupported MIDI capability: ${capabilityId}`);
    }
    this.emitState(capabilityId, state);
    return state;
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

  /** Simulate a physical mute press on the console. */
  simulatePhysicalMute(stripIndex: number, muted?: boolean): void {
    const address = muteAddress(stripIndex);
    if (this.pulseToggle) {
      const message: MidiControlChange = {
        channel: address.channel,
        controller: address.controller,
        value: 1,
      };
      if (this.transport instanceof MockMidiTransport) {
        this.transport.injectIncoming(message);
        return;
      }
      this.handleIncoming(message);
      return;
    }
    const message: MidiControlChange = {
      channel: address.channel,
      controller: address.controller,
      value: muted ? 1 : 0,
    };
    if (this.transport instanceof MockMidiTransport) {
      this.transport.injectIncoming(message);
      return;
    }
    this.handleIncoming(message);
  }

  private write(capabilityId: string, value: number | boolean | string): void {
    if (capabilityId === "recording") {
      if (typeof value !== "boolean") {
        throw new Error("Recording requires a boolean");
      }
      this.recording = value;
      const address = recordAddress();
      this.transport.sendControlChange({
        channel: address.channel,
        controller: address.controller,
        value: this.pulseToggle ? 1 : value ? 1 : 0,
      });
      return;
    }

    const padMatch = /^pad-(\d+):trigger$/.exec(capabilityId);
    if (padMatch) {
      if (value !== true && value !== 1) {
        return;
      }
      const padIndex = Number(padMatch[1]) - 1;
      const address = padTriggerAddress(padIndex);
      this.transport.sendControlChange({
        channel: address.channel,
        controller: address.controller,
        value: 1,
      });
      return;
    }

    const stripMatch = /^ch-(\d+):(mute|listen)$/.exec(capabilityId);
    if (!stripMatch) {
      throw new Error(
        `Capability ${capabilityId} is not available over official RØDECaster MIDI. Unsupported over MIDI: ${RODECASTER_MIDI_SUPPORT.unsupported.join(", ")}`,
      );
    }

    const stripIndex = Number(stripMatch[1]) - 1;
    const field = stripMatch[2] as "mute" | "listen";
    if (typeof value !== "boolean") {
      throw new Error(`${field} requires a boolean`);
    }

    const strip = this.strips[stripIndex];
    if (!strip) {
      throw new Error(`Unknown strip: ${stripIndex + 1}`);
    }

    if (field === "mute") {
      strip.muted = value;
      const address = muteAddress(stripIndex);
      this.transport.sendControlChange({
        channel: address.channel,
        controller: address.controller,
        value: this.pulseToggle ? 1 : value ? 1 : 0,
      });
      return;
    }

    strip.listening = value;
    const address = listenAddress(stripIndex);
    this.transport.sendControlChange({
      channel: address.channel,
      controller: address.controller,
      value: this.pulseToggle ? 1 : value ? 1 : 0,
    });
  }

  private handleIncoming(message: MidiControlChange): void {
    if (!this.online) {
      return;
    }

    const { controller, channel, value } = message;

    if (this.pulseToggle) {
      if (value === 0) {
        return;
      }
      if (controller === this.map.cc.record && channel === 1) {
        this.recording = !this.recording;
        this.emitState("recording", this.stateFor("recording", "hardware")!);
        return;
      }
      if (
        controller === this.map.cc.mute &&
        channel >= 1 &&
        channel <= this.map.channelCount
      ) {
        const strip = this.strips[channel - 1];
        if (!strip) return;
        strip.muted = !strip.muted;
        const capabilityId = `ch-${channel}:mute`;
        this.emitState(capabilityId, this.stateFor(capabilityId, "hardware")!);
        return;
      }
      if (
        controller === this.map.cc.listen &&
        channel >= 1 &&
        channel <= this.map.channelCount
      ) {
        const strip = this.strips[channel - 1];
        if (!strip) return;
        strip.listening = !strip.listening;
        const capabilityId = `ch-${channel}:listen`;
        this.emitState(capabilityId, this.stateFor(capabilityId, "hardware")!);
      }
      return;
    }

    const active = value > 0;

    if (controller === this.map.cc.record && channel === 1) {
      this.recording = active;
      this.emitState("recording", this.stateFor("recording", "hardware")!);
      return;
    }

    if (
      controller === this.map.cc.mute &&
      channel >= 1 &&
      channel <= this.map.channelCount
    ) {
      const strip = this.strips[channel - 1];
      if (!strip) return;
      strip.muted = active;
      const capabilityId = `ch-${channel}:mute`;
      this.emitState(capabilityId, this.stateFor(capabilityId, "hardware")!);
      return;
    }

    if (
      controller === this.map.cc.listen &&
      channel >= 1 &&
      channel <= this.map.channelCount
    ) {
      const strip = this.strips[channel - 1];
      if (!strip) return;
      strip.listening = active;
      const capabilityId = `ch-${channel}:listen`;
      this.emitState(capabilityId, this.stateFor(capabilityId, "hardware")!);
    }
  }

  private stateFor(
    capabilityId: string,
    source: StateSource,
  ): CapabilityState | undefined {
    const availability = this.online ? "available" : "offline";
    const timestamp = Date.now();

    if (capabilityId === "recording") {
      return {
        capabilityId,
        value: this.recording,
        availability,
        timestamp,
        source,
      };
    }

    if (/^pad-\d+:trigger$/.test(capabilityId)) {
      return {
        capabilityId,
        value: false,
        availability,
        timestamp,
        source,
      };
    }

    const stripMatch = /^ch-(\d+):(mute|listen)$/.exec(capabilityId);
    if (!stripMatch) {
      return undefined;
    }
    const stripIndex = Number(stripMatch[1]) - 1;
    const field = stripMatch[2] as "mute" | "listen";
    const strip = this.strips[stripIndex];
    if (!strip) {
      return undefined;
    }
    return {
      capabilityId,
      value: field === "mute" ? strip.muted : strip.listening,
      availability,
      timestamp,
      source,
    };
  }

  private buildDevice(): Device {
    const channelLabels = ["Mic", "Game", "Chat", "Music", "Aux", "Bluetooth"];
    const channelSources = [
      "PodMic",
      "Game",
      "Discord",
      "Music",
      "Aux",
      "Bluetooth",
    ];
    const endpoints: Endpoint[] = [];

    for (let i = 0; i < this.map.channelCount; i += 1) {
      const n = i + 1;
      endpoints.push({
        id: `${this.deviceId}:ch-${n}`,
        deviceId: this.deviceId,
        kind: "channel",
        label: `Ch ${n} (${channelLabels[i] ?? `Strip ${n}`})`,
        source: channelSources[i] ?? `Channel ${n}`,
        capabilities: [
          booleanCapability(`ch-${n}:mute`, "Mute"),
          booleanCapability(`ch-${n}:listen`, "Listen"),
        ],
      });
    }

    for (let i = 0; i < this.map.padCount; i += 1) {
      const n = i + 1;
      endpoints.push({
        id: `${this.deviceId}:pad-${n}`,
        deviceId: this.deviceId,
        kind: "pad",
        label: `SMART Pad ${n}`,
        source: `Pad ${n}`,
        capabilities: [booleanCapability(`pad-${n}:trigger`, "PadTrigger")],
      });
    }

    endpoints.push({
      id: `${this.deviceId}:transport`,
      deviceId: this.deviceId,
      kind: "mix",
      label: "Transport",
      source: "RØDECaster",
      capabilities: [booleanCapability("recording", "Recording")],
    });

    return {
      id: this.deviceId,
      manufacturer: "RØDE",
      family: "rodecaster",
      model:
        this.map.model === "duo"
          ? "RØDECaster Duo (MIDI)"
          : "RØDECaster Pro II (MIDI)",
      serial: this.serial,
      firmware: "midi-surface",
      connection: "midi",
      status: this.online ? "online" : "offline",
      endpoints,
      metadata: {
        controlTier: RODECASTER_MIDI_SUPPORT.tier,
        controlSurface: "official-midi",
        midiTransport: this.transport.name,
        midiPulseToggle: this.pulseToggle,
        supportedCapabilities: [...RODECASTER_MIDI_SUPPORT.supported],
        unsupportedCapabilities: [...RODECASTER_MIDI_SUPPORT.unsupported],
      },
    };
  }

  private assertOnline(deviceId: string): void {
    if (!this.online) {
      throw new Error("RØDECaster MIDI surface is offline");
    }
    if (deviceId !== this.deviceId) {
      throw new Error(`Unknown device: ${deviceId}`);
    }
  }

  private emitAll(source: StateSource): void {
    for (let i = 1; i <= this.map.channelCount; i += 1) {
      for (const field of ["mute", "listen"] as const) {
        const capabilityId = `ch-${i}:${field}`;
        const state = this.stateFor(capabilityId, source);
        if (state) this.emitState(capabilityId, state);
      }
    }
    for (let i = 1; i <= this.map.padCount; i += 1) {
      const capabilityId = `pad-${i}:trigger`;
      const state = this.stateFor(capabilityId, source);
      if (state) this.emitState(capabilityId, state);
    }
    const recording = this.stateFor("recording", source);
    if (recording) this.emitState("recording", recording);
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
    valueType: "boolean",
    metadata: { supportTier: "midi-tier-b" },
  };
}
