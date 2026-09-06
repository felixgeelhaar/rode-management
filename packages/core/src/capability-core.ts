import type { DeviceAdapter } from "./adapter.js";
import type {
  CapabilityDescriptor,
  CapabilityState,
  CapabilityType,
  CommandResult,
  ControlCommand,
  CoreEvent,
  CoreEventListener,
  Device,
  LogicalBinding,
  ResolvedCapability,
} from "./types.js";

export interface CapabilityCoreOptions {
  /** When true, missing devices keep bindings configured but mark them offline. */
  retainOfflineBindings?: boolean;
}

/**
 * Central control core: device graph, capability resolution, bindings, and state sync.
 */
export class CapabilityCore {
  private readonly adapters = new Map<string, DeviceAdapter>();
  private readonly deviceOwners = new Map<string, string>();
  private readonly devices = new Map<string, Device>();
  private readonly states = new Map<string, CapabilityState>();
  private readonly bindings = new Map<string, LogicalBinding>();
  private readonly listeners = new Set<CoreEventListener>();
  private readonly unsubscribers: Array<() => void> = [];
  private readonly options: Required<CapabilityCoreOptions>;

  constructor(options: CapabilityCoreOptions = {}) {
    this.options = {
      retainOfflineBindings: options.retainOfflineBindings ?? true,
    };
  }

  registerAdapter(adapter: DeviceAdapter): void {
    if (this.adapters.has(adapter.id)) {
      throw new Error(`Adapter already registered: ${adapter.id}`);
    }
    this.adapters.set(adapter.id, adapter);

    this.unsubscribers.push(
      adapter.onDevicesChanged((devices) => {
        this.ingestDevices(adapter.id, devices);
      }),
    );

    this.unsubscribers.push(
      adapter.onStateChanged(({ deviceId, capabilityId, state }) => {
        this.applyObservedState(deviceId, capabilityId, state);
      }),
    );
  }

  async start(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      await adapter.start();
      this.ingestDevices(adapter.id, adapter.listDevices());
    }
  }

  async stop(): Promise<void> {
    for (const unsubscribe of this.unsubscribers.splice(0)) {
      unsubscribe();
    }
    for (const adapter of this.adapters.values()) {
      await adapter.stop();
    }
  }

  upsertBinding(binding: LogicalBinding): void {
    this.bindings.set(binding.id, binding);
    const resolved = this.resolveBinding(binding.id);
    if (resolved) {
      this.emit({ type: "binding-online", bindingId: binding.id, resolved });
    } else if (this.options.retainOfflineBindings) {
      this.emit({
        type: "binding-offline",
        bindingId: binding.id,
        reason: "No matching capability owner found",
      });
    }
  }

  getBinding(bindingId: string): LogicalBinding | undefined {
    return this.bindings.get(bindingId);
  }

  listBindings(): LogicalBinding[] {
    return [...this.bindings.values()];
  }

  listDevices(): Device[] {
    return [...this.devices.values()];
  }

  getDevice(deviceId: string): Device | undefined {
    return this.devices.get(deviceId);
  }

  resolveBinding(bindingId: string): ResolvedCapability | undefined {
    const binding = this.bindings.get(bindingId);
    if (!binding) {
      return undefined;
    }

    const candidates = this.findCapabilityOwners(binding);
    const match = candidates[0];
    if (!match) {
      return undefined;
    }

    const stateKey = this.stateKey(match.device.id, match.capability.id);
    const state =
      this.states.get(stateKey) ??
      this.readFreshState(match.device.id, match.capability.id) ??
      this.offlineState(match.capability.id);

    if (match.device.status === "offline") {
      return {
        ...match,
        binding,
        state: {
          ...state,
          availability: "offline",
        },
      };
    }

    return { ...match, binding, state };
  }

  async execute(command: ControlCommand): Promise<CommandResult> {
    const bindingId = command.bindingId;
    const resolved = this.resolveBinding(bindingId);

    if (!resolved) {
      const error = `Binding unavailable: ${bindingId}`;
      this.emit({ type: "command-failed", bindingId, error });
      return { ok: false, error };
    }

    if (
      resolved.device.status === "offline" ||
      resolved.state.availability === "offline"
    ) {
      const error = `${resolved.binding.label} is offline`;
      this.emit({ type: "command-failed", bindingId, error });
      return { ok: false, resolved, error };
    }

    if (!resolved.capability.writable) {
      const error = `Capability ${resolved.capability.type} is not writable`;
      this.emit({ type: "command-failed", bindingId, error });
      return { ok: false, resolved, error };
    }

    const adapter = this.findAdapterForDevice(resolved.device.id);
    if (!adapter) {
      const error = `No adapter for device ${resolved.device.id}`;
      this.emit({ type: "command-failed", bindingId, error });
      return { ok: false, resolved, error };
    }

    try {
      const nextValue = this.commandToValue(command, resolved);
      let state: CapabilityState;

      if (
        (command.type === "AdjustGain" || command.type === "AdjustLevel") &&
        adapter.adjustCapabilityValue
      ) {
        state = await adapter.adjustCapabilityValue(
          resolved.device.id,
          resolved.capability.id,
          command.delta,
          "stream-deck",
        );
      } else if (nextValue !== undefined) {
        state = await adapter.setCapabilityValue(
          resolved.device.id,
          resolved.capability.id,
          nextValue,
          "stream-deck",
        );
      } else {
        return {
          ok: false,
          resolved,
          error: `Unsupported command for binding: ${command.type}`,
        };
      }

      // Adapters emit observed state; applyObservedState updates the graph.
      // Keep a local fallback in case an adapter returns state without notifying.
      const key = this.stateKey(resolved.device.id, resolved.capability.id);
      if (this.states.get(key)?.timestamp !== state.timestamp) {
        this.states.set(key, state);
        const updated: ResolvedCapability = { ...resolved, state };
        this.emit({ type: "state-changed", resolved: updated });
        return { ok: true, resolved: updated, state };
      }

      const updated = this.resolveBinding(bindingId) ?? {
        ...resolved,
        state,
      };
      return { ok: true, resolved: updated, state };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.emit({ type: "command-failed", bindingId, error });
      return { ok: false, resolved, error };
    }
  }

  subscribe(listener: CoreEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Snapshot presentation model for Stream Deck (or other clients). */
  getControlSurface(bindingId: string): {
    label: string;
    valueText: string;
    availability: CapabilityState["availability"];
  } {
    const binding = this.bindings.get(bindingId);

    if (!binding) {
      return { label: bindingId, valueText: "—", availability: "unsupported" };
    }

    const resolved = this.resolveBinding(bindingId);
    if (!resolved || resolved.state.availability === "offline") {
      return {
        label: binding.label,
        valueText: "OFFLINE",
        availability: "offline",
      };
    }

    return {
      label: binding.label,
      valueText: formatCapabilityValue(resolved.capability, resolved.state.value),
      availability: resolved.state.availability,
    };
  }

  private ingestDevices(adapterId: string, devices: Device[]): void {
    const reportedIds = new Set(devices.map((d) => d.id));

    for (const device of devices) {
      const existing = this.devices.get(device.id);
      this.deviceOwners.set(device.id, adapterId);
      this.devices.set(device.id, device);

      for (const endpoint of device.endpoints) {
        for (const capability of endpoint.capabilities) {
          const key = this.stateKey(device.id, capability.id);
          if (!this.states.has(key)) {
            const fresh = this.readFreshState(device.id, capability.id);
            if (fresh) {
              this.states.set(key, fresh);
            }
          }
        }
      }

      if (!existing) {
        this.emit({ type: "device-discovered", device });
        this.reconcileBindingsForDevice(device);
      } else {
        this.emit({ type: "device-updated", device });
        if (existing.status !== device.status) {
          this.reconcileBindingsForDevice(device);
        }
      }
    }

    // Mark owned devices missing from this adapter report as offline (do not remove bindings).
    for (const [deviceId, ownerId] of this.deviceOwners.entries()) {
      if (ownerId !== adapterId || reportedIds.has(deviceId)) {
        continue;
      }
      const existing = this.devices.get(deviceId);
      if (existing && existing.status !== "offline") {
        const offlineDevice: Device = { ...existing, status: "offline" };
        this.devices.set(deviceId, offlineDevice);
        this.emit({ type: "device-updated", device: offlineDevice });
        this.reconcileBindingsForDevice(offlineDevice);
      }
    }
  }

  private reconcileBindingsForDevice(device: Device): void {
    for (const binding of this.bindings.values()) {
      if (binding.deviceId && binding.deviceId !== device.id) {
        continue;
      }

      const resolved = this.resolveBinding(binding.id);
      if (!resolved) {
        if (this.options.retainOfflineBindings) {
          this.emit({
            type: "binding-offline",
            bindingId: binding.id,
            reason: "Device unavailable",
          });
        }
        continue;
      }

      if (resolved.device.id !== device.id) {
        continue;
      }

      if (device.status === "offline") {
        this.emit({
          type: "binding-offline",
          bindingId: binding.id,
          reason: "Device offline",
        });
      } else {
        this.emit({ type: "binding-online", bindingId: binding.id, resolved });
        this.emit({ type: "state-changed", resolved });
      }
    }
  }

  private applyObservedState(
    deviceId: string,
    capabilityId: string,
    state: CapabilityState,
  ): void {
    this.states.set(this.stateKey(deviceId, capabilityId), state);

    for (const binding of this.bindings.values()) {
      const resolved = this.resolveBinding(binding.id);
      if (
        resolved &&
        resolved.device.id === deviceId &&
        resolved.capability.id === capabilityId
      ) {
        this.emit({
          type: "state-changed",
          resolved: { ...resolved, state },
        });
      }
    }
  }

  private findCapabilityOwners(binding: LogicalBinding): Array<{
    device: Device;
    endpoint: Device["endpoints"][number];
    capability: CapabilityDescriptor;
  }> {
    const results: Array<{
      device: Device;
      endpoint: Device["endpoints"][number];
      capability: CapabilityDescriptor;
    }> = [];

    for (const device of this.devices.values()) {
      if (binding.deviceId && binding.deviceId !== device.id) {
        continue;
      }

      for (const endpoint of device.endpoints) {
        if (binding.endpointId && binding.endpointId !== endpoint.id) {
          continue;
        }

        if (binding.sourceHint) {
          const hint = binding.sourceHint.toLowerCase();
          const source = endpoint.source?.toLowerCase() ?? "";
          const label = endpoint.label.toLowerCase();
          if (!source.includes(hint) && !label.includes(hint)) {
            continue;
          }
        }

        const capability = endpoint.capabilities.find(
          (c) => c.type === binding.capabilityType,
        );
        if (!capability) {
          continue;
        }

        results.push({ device, endpoint, capability });
      }
    }

    return results.sort((a, b) => {
      const onlineScore =
        Number(b.device.status === "online") - Number(a.device.status === "online");
      if (onlineScore !== 0) {
        return onlineScore;
      }
      const aLabel =
        a.endpoint.label.toLowerCase() === binding.label.toLowerCase() ? 1 : 0;
      const bLabel =
        b.endpoint.label.toLowerCase() === binding.label.toLowerCase() ? 1 : 0;
      return bLabel - aLabel;
    });
  }

  private commandToValue(
    command: ControlCommand,
    resolved: ResolvedCapability,
  ): number | boolean | string | undefined {
    switch (command.type) {
      case "SetGain":
      case "SetLevel":
        return clampNumeric(command.value, resolved.capability);
      case "AdjustGain":
      case "AdjustLevel": {
        const current =
          typeof resolved.state.value === "number" ? resolved.state.value : 0;
        return clampNumeric(current + command.delta, resolved.capability);
      }
      case "SetMute":
        return command.value;
      case "ToggleMute":
      case "ToggleListen":
        return !(resolved.state.value === true);
      case "SetProcessing":
        return command.value;
      default:
        return undefined;
    }
  }

  private readFreshState(
    deviceId: string,
    capabilityId: string,
  ): CapabilityState | undefined {
    const adapter = this.findAdapterForDevice(deviceId);
    return adapter?.getCapabilityState(deviceId, capabilityId);
  }

  private findAdapterForDevice(deviceId: string): DeviceAdapter | undefined {
    const adapterId = this.deviceOwners.get(deviceId);
    if (!adapterId) {
      return undefined;
    }
    return this.adapters.get(adapterId);
  }

  private offlineState(capabilityId: string): CapabilityState {
    return {
      capabilityId,
      value: null,
      availability: "offline",
      timestamp: Date.now(),
      source: "reconciliation",
    };
  }

  private stateKey(deviceId: string, capabilityId: string): string {
    return `${deviceId}::${capabilityId}`;
  }

  private emit(event: CoreEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

export function formatCapabilityValue(
  capability: CapabilityDescriptor,
  value: CapabilityState["value"],
): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (capability.valueType === "boolean") {
    return value ? "ON" : "OFF";
  }
  if (typeof value === "number") {
    const unit = capability.unit ? ` ${capability.unit}` : "";
    const precision = capability.step !== undefined && capability.step < 1 ? 1 : 0;
    return `${value.toFixed(precision)}${unit}`;
  }
  return String(value);
}

function clampNumeric(value: number, capability: CapabilityDescriptor): number {
  let next = value;
  if (capability.minimum !== undefined) {
    next = Math.max(capability.minimum, next);
  }
  if (capability.maximum !== undefined) {
    next = Math.min(capability.maximum, next);
  }
  if (capability.step !== undefined && capability.step > 0) {
    const min = capability.minimum ?? 0;
    next = Math.round((next - min) / capability.step) * capability.step + min;
    next = Number(next.toFixed(6));
  }
  return next;
}

/** Helper for tests and clients: create a My Mic → Gain binding. */
export function createMicGainBinding(
  overrides: Partial<LogicalBinding> = {},
): LogicalBinding {
  return {
    id: "my-mic-gain",
    label: "My Mic",
    capabilityType: "Gain" as CapabilityType,
    ...overrides,
  };
}
