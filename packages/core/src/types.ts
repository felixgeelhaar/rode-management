/**
 * Canonical domain types for the RØDE capability control layer.
 *
 * Product model: Source → Endpoint → Capability → Device → Adapter → Core → Binding → Logical Control → Stream Deck
 */

export type DeviceStatus = "online" | "offline" | "connecting" | "error";

export type EndpointKind =
  | "input"
  | "output"
  | "channel"
  | "mix"
  | "monitor"
  | "headphone"
  | "virtual-source"
  | "wireless-transmitter"
  | "wireless-receiver"
  | "pad"
  | "microphone";

export type CapabilityType =
  | "Level"
  | "Gain"
  | "Mute"
  | "Listen"
  | "Monitoring"
  | "Compression"
  | "NoiseGate"
  | "HighPassFilter"
  | "Equalizer"
  | "Routing"
  | "Preset"
  | "Recording"
  | "PadTrigger"
  | "BatteryState";

export type ValueType = "number" | "boolean" | "enum" | "string";

export type Availability = "available" | "offline" | "unsupported" | "error";

export type StateSource =
  | "stream-deck"
  | "hardware"
  | "companion-app"
  | "firmware"
  | "system"
  | "reconciliation"
  | "simulation";

export interface Device {
  id: string;
  manufacturer: string;
  family: string;
  model: string;
  serial?: string;
  firmware?: string;
  connection: string;
  status: DeviceStatus;
  endpoints: Endpoint[];
  /** Adapter-specific facts (control tier, surface kind, support limits). */
  metadata?: Record<string, unknown>;
}

export interface Endpoint {
  id: string;
  deviceId: string;
  kind: EndpointKind;
  label: string;
  /** Semantic description of what generates the signal (may not be controllable). */
  source?: string;
  capabilities: CapabilityDescriptor[];
}

export interface CapabilityDescriptor {
  id: string;
  type: CapabilityType;
  readable: boolean;
  writable: boolean;
  observable: boolean;
  valueType: ValueType;
  unit?: string;
  minimum?: number;
  maximum?: number;
  step?: number;
  enumValues?: string[];
  metadata?: Record<string, unknown>;
}

export interface CapabilityState {
  capabilityId: string;
  value: number | boolean | string | null;
  availability: Availability;
  timestamp: number;
  source: StateSource;
  error?: string;
}

export interface TopologyEdge {
  from: string;
  to: string;
  relation: "feeds" | "owns" | "routes-to" | "monitors";
}

export interface Topology {
  edges: TopologyEdge[];
}

/**
 * User-facing semantic control that resolves to a concrete capability owner.
 * Example: "My Mic" → PodMic USB / Microphone Endpoint / Gain
 */
export interface LogicalBinding {
  id: string;
  label: string;
  /** Preferred capability type to resolve (e.g. Gain). */
  capabilityType: CapabilityType;
  /**
   * Optional explicit endpoint id. When omitted, resolution uses
   * label/source heuristics against the device graph.
   */
  endpointId?: string;
  /** Optional device id constraint. */
  deviceId?: string;
  /** Soft source label match (e.g. "PodMic"). */
  sourceHint?: string;
}

export type ControlCommand =
  | { type: "SetLevel"; bindingId: string; value: number }
  | { type: "AdjustLevel"; bindingId: string; delta: number }
  | { type: "SetGain"; bindingId: string; value: number }
  | { type: "AdjustGain"; bindingId: string; delta: number }
  | { type: "SetMute"; bindingId: string; value: boolean }
  | { type: "ToggleMute"; bindingId: string }
  | { type: "ToggleListen"; bindingId: string }
  | { type: "SetProcessing"; bindingId: string; capabilityType: CapabilityType; value: number | boolean | string }
  | { type: "ToggleProcessing"; bindingId: string; capabilityType: CapabilityType }
  | { type: "ApplyPreset"; bindingId: string; presetId: string }
  | { type: "TriggerPad"; bindingId: string }
  | { type: "StartRecording"; bindingId: string }
  | { type: "StopRecording"; bindingId: string };

export interface ResolvedCapability {
  binding: LogicalBinding;
  device: Device;
  endpoint: Endpoint;
  capability: CapabilityDescriptor;
  state: CapabilityState;
}

export interface CommandResult {
  ok: boolean;
  resolved?: ResolvedCapability;
  state?: CapabilityState;
  error?: string;
}

export type CoreEvent =
  | { type: "device-discovered"; device: Device }
  | { type: "device-updated"; device: Device }
  | { type: "device-removed"; deviceId: string }
  | { type: "state-changed"; resolved: ResolvedCapability }
  | { type: "binding-offline"; bindingId: string; reason: string }
  | { type: "binding-online"; bindingId: string; resolved: ResolvedCapability }
  | { type: "command-failed"; bindingId: string; error: string };

export type CoreEventListener = (event: CoreEvent) => void;
