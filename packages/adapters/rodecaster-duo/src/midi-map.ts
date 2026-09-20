/**
 * Official RØDECaster Pro II / Duo MIDI control map.
 *
 * Source: RØDE Help — "MIDI Triggers for RØDECaster Pro II / Duo"
 * This is a documented, first-party MIDI surface — not reverse-engineered HID.
 *
 * Honest capability limits vs the companion app:
 * - Supported: mute, listen, SMART pads, record, pad bank
 * - Not supported over official MIDI: fader levels, input gain, DSP
 */

export const RODECASTER_MIDI_PORT_HINTS = [
  "RØDECaster",
  "RODECaster",
  "MIDI Function",
] as const;

/** Duo has 4 channel strips; Pro II has 6. */
export type RodecasterModel = "duo" | "pro-ii";

export interface RodecasterMidiMap {
  model: RodecasterModel;
  channelCount: number;
  padCount: number;
  /** CC numbers from the official reference table. */
  cc: {
    padBank: number;
    record: number;
    channelButton: number;
    listen: number;
    mute: number;
    padTrigger: number;
    padColor: number;
  };
}

export const RODECASTER_DUO_MIDI_MAP: RodecasterMidiMap = {
  model: "duo",
  channelCount: 4,
  padCount: 6,
  cc: {
    padBank: 0,
    record: 17,
    channelButton: 20,
    listen: 24,
    mute: 27,
    padTrigger: 35,
    padColor: 37,
  },
};

export const RODECASTER_PRO_II_MIDI_MAP: RodecasterMidiMap = {
  model: "pro-ii",
  channelCount: 6,
  padCount: 8,
  cc: {
    padBank: 0,
    record: 17,
    channelButton: 20,
    listen: 24,
    mute: 27,
    padTrigger: 35,
    padColor: 37,
  },
};

export type MidiDirection = "send" | "receive" | "both";

export interface MidiCcAddress {
  controller: number;
  /** MIDI channel 1–16 (not zero-based). */
  channel: number;
  value?: number;
  direction: MidiDirection;
}

/** Mute for strip index 0..n-1 → MIDI channel 1..n, CC 27. */
export function muteAddress(stripIndex: number): MidiCcAddress {
  return {
    controller: RODECASTER_DUO_MIDI_MAP.cc.mute,
    channel: stripIndex + 1,
    value: 1,
    direction: "both",
  };
}

/** Listen/solo for strip index 0..n-1 → MIDI channel 1..n, CC 24. */
export function listenAddress(stripIndex: number): MidiCcAddress {
  return {
    controller: RODECASTER_DUO_MIDI_MAP.cc.listen,
    channel: stripIndex + 1,
    value: 1,
    direction: "both",
  };
}

/** Pad trigger for pad index 0..n-1 → MIDI channel 1..n, CC 35 (receive on device). */
export function padTriggerAddress(padIndex: number): MidiCcAddress {
  return {
    controller: RODECASTER_DUO_MIDI_MAP.cc.padTrigger,
    channel: padIndex + 1,
    value: 1,
    direction: "send",
  };
}

/** Record button → MIDI channel 1, CC 17. */
export function recordAddress(): MidiCcAddress {
  return {
    controller: RODECASTER_DUO_MIDI_MAP.cc.record,
    channel: 1,
    value: 1,
    direction: "both",
  };
}

export const RODECASTER_MIDI_SUPPORT = {
  tier: "B" as const,
  label: "Control (official MIDI)",
  supported: ["Mute", "Listen", "PadTrigger", "Recording"] as const,
  unsupported: ["Level", "Gain", "Monitoring", "Compression", "NoiseGate", "HighPassFilter"] as const,
  notes: [
    "Uses RØDE's documented MIDI surface for Duo / Pro II.",
    "Does not expose fader levels or input gain — those require the proprietary app protocol or physical controls.",
    "PodMic USB has no public MIDI/API path; keep using the simulator until hardware protocol work lands.",
  ],
};
