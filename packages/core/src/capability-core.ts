import type { DeviceAdapter } from "./adapter.js";
import {
  createBindingProfile,
  parseBindingProfile,
  serializeBindingProfile,
  type BindingProfile,
} from "./bindings-io.js";
import type {
  CapabilityDescriptor,
  CapabilityState,
  CapabilityType,
  CommandResult,
  ControlCommand,
  CoreEvent,
  CoreEventListener,
  Device,
  Endpoint,
  LogicalBinding,
  ResolvedCapability,
  Topology,
} from "./types.js";

export interface CapabilityCoreOptions {
  /** When true, missing devices keep bindings configured but mark them offline. */
  retainOfflineBindings?: boolean;
  /**
   * Prefer mixer-owned capabilities when multiple adapters expose the same
   * logical control (RØDECaster-centered topologies). Default true.
   */
  preferMixerOwnership?: boolean;
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
  private topology: Topology = { edges: [] };

  constructor(options: CapabilityCoreOptions = {}) {
    this.options = {
      retainOfflineBindings: options.retainOfflineBindings ?? true,
      preferMixerOwnership: options.preferMixerOwnership ?? true,
    };
  }

  /** Declare topology edges used for ownership ranking (e.g. USB mic feeds mixer input). */
  setTopology(topology: Topology): void {
    this.topology = {
      edges: topology.edges.map((edge) => ({ ...edge })),
    };
  }

  getTopology(): Topology {
    return {
      edges: this.topology.edges.map((edge) => ({ ...edge })),
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

  clearBindings(): void {
    this.bindings.clear();
  }

  /** Snapshot bindings (+ topology) for persistence or sharing. */
  exportProfile(adapterHint?: string): BindingProfile {
    return createBindingProfile(this.listBindings(), {
      topology: this.getTopology(),
      ...(adapterHint !== undefined ? { adapterHint } : {}),
    });
  }

  exportProfileJson(adapterHint?: string): string {
    return serializeBindingProfile(this.exportProfile(adapterHint));
  }

  /**
   * Load a profile. When `replace` is true, clears existing bindings first.
   * Topology from the profile replaces the current graph when present.
   */
  importProfile(
    profile: BindingProfile | string,
    options: { replace?: boolean } = {},
  ): void {
    const parsed =
      typeof profile === "string" ? parseBindingProfile(profile) : profile;
    if (options.replace) {
      this.clearBindings();
    }
    if (parsed.topology) {
      this.setTopology(parsed.topology);
    }
    for (const binding of parsed.bindings) {
      this.upsertBinding(binding);
    }
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
    const base = this.resolveBinding(bindingId);

    if (!base) {
      const error = `Binding unavailable: ${bindingId}`;
      this.emit({ type: "command-failed", bindingId, error });
      return { ok: false, error };
    }

    if (
      base.device.status === "offline" ||
      base.state.availability === "offline"
    ) {
      const error = `${base.binding.label} is offline`;
      this.emit({ type: "command-failed", bindingId, error });
      return { ok: false, resolved: base, error };
    }

    const resolved = this.retargetCommand(command, base);
    if (!resolved) {
      const error = this.retargetError(command, base);
      this.emit({ type: "command-failed", bindingId, error });
      return { ok: false, resolved: base, error };
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

      const updated: ResolvedCapability = {
        ...resolved,
        state: this.states.get(key) ?? state,
      };
      return { ok: true, resolved: updated, state: updated.state };
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
    if (resolved) {
      if (resolved.state.availability === "offline") {
        return {
          label: binding.label,
          valueText: "OFFLINE",
          availability: "offline",
        };
      }
      return {
        label: binding.label,
        valueText: formatCapabilityValue(
          resolved.capability,
          resolved.state.value,
        ),
        availability: resolved.state.availability,
      };
    }

    // Unresolved: distinguish "device gone" from "tier doesn't offer this".
    const diagnosis = this.diagnoseUnresolved(binding);
    if (diagnosis === "unsupported") {
      return {
        label: binding.label,
        valueText: "N/A",
        availability: "unsupported",
      };
    }

    return {
      label: binding.label,
      valueText: "OFFLINE",
      availability: "offline",
    };
  }

  /**
   * Read a sibling capability on the same endpoint as a binding
   * (e.g. Mute beside a Gain binding).
   */
  getSiblingState(
    bindingId: string,
    capabilityType: CapabilityType,
  ): CapabilityState | undefined {
    const resolved = this.resolveBinding(bindingId);
    if (!resolved) {
      return undefined;
    }
    const capability = resolved.endpoint.capabilities.find(
      (item) => item.type === capabilityType,
    );
    if (!capability) {
      return undefined;
    }
    return (
      this.states.get(this.stateKey(resolved.device.id, capability.id)) ??
      this.readFreshState(resolved.device.id, capability.id)
    );
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

      const ownership =
        this.ownershipScore(b, binding) - this.ownershipScore(a, binding);
      if (ownership !== 0) {
        return ownership;
      }

      const aLabel =
        a.endpoint.label.toLowerCase() === binding.label.toLowerCase() ? 1 : 0;
      const bLabel =
        b.endpoint.label.toLowerCase() === binding.label.toLowerCase() ? 1 : 0;
      return bLabel - aLabel;
    });
  }

  /**
   * Rank competing owners for the same logical binding.
   * Mixer-fed channel endpoints beat USB mic endpoints when preferred.
   */
  private ownershipScore(
    candidate: {
      device: Device;
      endpoint: Endpoint;
      capability: CapabilityDescriptor;
    },
    binding: LogicalBinding,
  ): number {
    let score = 0;

    if (this.options.preferMixerOwnership) {
      if (candidate.device.family === "rodecaster") {
        score += 20;
      }
      if (
        (binding.capabilityType === "Gain" ||
          binding.capabilityType === "Mute" ||
          binding.capabilityType === "Level") &&
        candidate.endpoint.kind === "channel"
      ) {
        score += 10;
      }
      if (candidate.endpoint.kind === "microphone") {
        score += 4;
      }
    }

    // Topology: prefer the "owns" / downstream side of a feeds edge.
    for (const edge of this.topology.edges) {
      if (edge.relation === "feeds" && edge.to === candidate.endpoint.id) {
        score += 15;
      }
      if (edge.relation === "owns" && edge.from === candidate.endpoint.id) {
        score += 15;
      }
    }

    return score;
  }

  /**
   * When a binding does not resolve: offline (no live devices) vs unsupported
   * (live devices present but none expose a matching capability / filters).
   */
  private diagnoseUnresolved(
    _binding: LogicalBinding,
  ): "offline" | "unsupported" {
    const onlineDevices = [...this.devices.values()].filter(
      (device) => device.status === "online",
    );
    return onlineDevices.length === 0 ? "offline" : "unsupported";
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
      case "ToggleProcessing":
        return !(resolved.state.value === true);
      case "TriggerPad":
        return true;
      case "StartRecording":
        return true;
      case "StopRecording":
        return false;
      default:
        return undefined;
    }
  }

  /**
   * Dial press / processing commands may target a sibling capability on the
   * same endpoint as the bound control (e.g. Mic Gain dial → Mute).
   */
  private retargetCommand(
    command: ControlCommand,
    base: ResolvedCapability,
  ): ResolvedCapability | undefined {
    const targetType = this.commandTargetType(command, base);
    if (!targetType || targetType === base.capability.type) {
      return base;
    }

    const capability = base.endpoint.capabilities.find((c) => c.type === targetType);
    if (!capability) {
      return undefined;
    }

    const stateKey = this.stateKey(base.device.id, capability.id);
    const state =
      this.states.get(stateKey) ??
      this.readFreshState(base.device.id, capability.id) ??
      this.offlineState(capability.id);

    return {
      binding: base.binding,
      device: base.device,
      endpoint: base.endpoint,
      capability,
      state,
    };
  }

  private commandTargetType(
    command: ControlCommand,
    base: ResolvedCapability,
  ): CapabilityType | undefined {
    switch (command.type) {
      case "SetMute":
      case "ToggleMute":
        return "Mute";
      case "ToggleListen":
        return "Listen";
      case "SetProcessing":
      case "ToggleProcessing":
        return command.capabilityType;
      case "SetGain":
      case "AdjustGain":
        return "Gain";
      case "SetLevel":
      case "AdjustLevel":
        return base.capability.type === "Monitoring" ? "Monitoring" : "Level";
      case "TriggerPad":
        return "PadTrigger";
      case "StartRecording":
      case "StopRecording":
        return "Recording";
      default:
        return base.capability.type;
    }
  }

  private retargetError(
    command: ControlCommand,
    base: ResolvedCapability,
  ): string {
    const target = this.commandTargetType(command, base);
    return `Endpoint ${base.endpoint.label} has no ${target ?? "target"} capability`;
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

/** Create a logical binding for any capability type. */
export function createBinding(
  id: string,
  label: string,
  capabilityType: CapabilityType,
  overrides: Partial<LogicalBinding> = {},
): LogicalBinding {
  return {
    id,
    label,
    capabilityType,
    ...overrides,
  };
}

export interface SuggestedBinding {
  bank: "mix" | "mic" | "outputs" | "production";
  binding: LogicalBinding;
  role: string;
}

function bindingLocation(
  deviceId: string,
  endpointId: string,
  sourceHint?: string,
): Partial<LogicalBinding> {
  return sourceHint
    ? { deviceId, endpointId, sourceHint }
    : { deviceId, endpointId };
}

/**
 * Propose Stream Deck banks from the discovered device graph.
 * Users can customize; this is the auto-layout starting point from the intent.
 */
export function suggestCreatorBindings(devices: Device[]): SuggestedBinding[] {
  const suggestions: SuggestedBinding[] = [];

  for (const device of devices) {
    if (device.status === "offline") {
      continue;
    }

    for (const endpoint of device.endpoints) {
      const source = (endpoint.source ?? endpoint.label).toLowerCase();
      const label = endpoint.label;

      const gain = endpoint.capabilities.find((c) => c.type === "Gain");
      const level = endpoint.capabilities.find((c) => c.type === "Level");
      const mute = endpoint.capabilities.find((c) => c.type === "Mute");
      const monitor = endpoint.capabilities.find((c) => c.type === "Monitoring");
      const pad = endpoint.capabilities.find((c) => c.type === "PadTrigger");

      const isMic =
        endpoint.kind === "microphone" ||
        source.includes("podmic") ||
        source.includes("mic") ||
        label.toLowerCase().includes("mic");

      const location = bindingLocation(device.id, endpoint.id, endpoint.source);

      if (isMic && gain) {
        suggestions.push({
          bank: "mix",
          role: "mic-level-or-gain",
          binding: createMicGainBinding({
            id: `${endpoint.id}:gain`,
            label: "MIC",
            ...location,
          }),
        });
        suggestions.push({
          bank: "mic",
          role: "mic-gain",
          binding: createBinding(`${endpoint.id}:gain-detail`, "GAIN", "Gain", location),
        });
      } else if (level && (endpoint.kind === "channel" || endpoint.kind === "virtual-source")) {
        const short = shortLabel(endpoint);
        suggestions.push({
          bank: "mix",
          role: "channel-level",
          binding: createBinding(`${endpoint.id}:level`, short, "Level", location),
        });
      }

      if (isMic && monitor) {
        suggestions.push({
          bank: "mic",
          role: "monitor",
          binding: createBinding(`${endpoint.id}:monitor`, "MONITOR", "Monitoring", {
            deviceId: device.id,
            endpointId: endpoint.id,
          }),
        });
      }

      const hpf = endpoint.capabilities.find((c) => c.type === "HighPassFilter");
      if (isMic && hpf) {
        suggestions.push({
          bank: "mic",
          role: "high-pass",
          binding: createBinding(`${endpoint.id}:hpf`, "HPF", "HighPassFilter", {
            deviceId: device.id,
            endpointId: endpoint.id,
          }),
        });
      }

      const compression = endpoint.capabilities.find((c) => c.type === "Compression");
      if (isMic && compression) {
        suggestions.push({
          bank: "mic",
          role: "compressor",
          binding: createBinding(`${endpoint.id}:comp`, "COMP", "Compression", {
            deviceId: device.id,
            endpointId: endpoint.id,
          }),
        });
      }

      if (mute && isMic) {
        suggestions.push({
          bank: "mic",
          role: "mute",
          binding: createBinding(`${endpoint.id}:mute`, "MUTE", "Mute", {
            deviceId: device.id,
            endpointId: endpoint.id,
          }),
        });
      } else if (mute && endpoint.kind === "channel") {
        suggestions.push({
          bank: "production",
          role: "channel-mute",
          binding: createBinding(
            `${endpoint.id}:mute`,
            `${shortLabel(endpoint)} MUTE`,
            "Mute",
            location,
          ),
        });
      }

      const listen = endpoint.capabilities.find((c) => c.type === "Listen");
      if (listen && endpoint.kind === "channel") {
        suggestions.push({
          bank: "production",
          role: "channel-listen",
          binding: createBinding(
            `${endpoint.id}:listen`,
            `${shortLabel(endpoint)} LISTEN`,
            "Listen",
            location,
          ),
        });
      }

      const recording = endpoint.capabilities.find((c) => c.type === "Recording");
      if (recording) {
        suggestions.push({
          bank: "production",
          role: "record",
          binding: createBinding(`${endpoint.id}:record`, "REC", "Recording", {
            deviceId: device.id,
            endpointId: endpoint.id,
          }),
        });
      }

      if (
        endpoint.kind === "headphone" ||
        endpoint.kind === "output" ||
        label.toLowerCase().includes("headphone")
      ) {
        if (level || monitor) {
          suggestions.push({
            bank: "outputs",
            role: "headphones",
            binding: createBinding(
              `${endpoint.id}:out`,
              "HP",
              level ? "Level" : "Monitoring",
              {
                deviceId: device.id,
                endpointId: endpoint.id,
              },
            ),
          });
        }
      }

      if (pad) {
        suggestions.push({
          bank: "production",
          role: "smart-pad",
          binding: createBinding(`${endpoint.id}:pad`, label || "PAD", "PadTrigger", {
            deviceId: device.id,
            endpointId: endpoint.id,
          }),
        });
      }
    }
  }

  return suggestions;
}

function shortLabel(endpoint: Endpoint): string {
  const source = endpoint.source ?? endpoint.label;
  const upper = source.toUpperCase();
  if (upper.includes("GAME")) return "GAME";
  if (upper.includes("CHAT") || upper.includes("DISCORD")) return "CHAT";
  if (upper.includes("MUSIC") || upper.includes("SPOTIFY")) return "MUSIC";
  if (upper.includes("BROWSER")) return "BROWSER";
  if (upper.includes("MIC")) return "MIC";
  return endpoint.label.slice(0, 8).toUpperCase();
}
