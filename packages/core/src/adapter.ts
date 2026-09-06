import type {
  CapabilityDescriptor,
  CapabilityState,
  ControlCommand,
  Device,
  Endpoint,
  StateSource,
} from "./types.js";

/**
 * Device adapters translate proprietary protocols into the canonical capability model.
 * Adapters own discovery, connection, protocol, capability negotiation, commands,
 * observation, and reconnection — never Stream Deck UI concepts.
 */
export interface DeviceAdapter {
  readonly id: string;
  readonly family: string;

  start(): Promise<void>;
  stop(): Promise<void>;

  listDevices(): Device[];

  getCapabilityState(
    deviceId: string,
    capabilityId: string,
  ): CapabilityState | undefined;

  /**
   * Apply an absolute value to a writable capability.
   * Returns authoritative state after the write (or best-effort observed state).
   */
  setCapabilityValue(
    deviceId: string,
    capabilityId: string,
    value: number | boolean | string,
    source: StateSource,
  ): Promise<CapabilityState>;

  /**
   * Optional relative adjustment helper. Adapters may coalesce rapid deltas.
   */
  adjustCapabilityValue?(
    deviceId: string,
    capabilityId: string,
    delta: number,
    source: StateSource,
  ): Promise<CapabilityState>;

  onDevicesChanged(listener: (devices: Device[]) => void): () => void;
  onStateChanged(
    listener: (update: {
      deviceId: string;
      capabilityId: string;
      state: CapabilityState;
    }) => void,
  ): () => void;
}

export interface AdapterCommandContext {
  device: Device;
  endpoint: Endpoint;
  capability: CapabilityDescriptor;
  command: ControlCommand;
}
