import { RODECASTER_MIDI_PORT_HINTS } from "./midi-map.js";

/**
 * Pick a MIDI port index by explicit name or RØDECaster hints.
 * Returns -1 when nothing matches.
 */
export function findMidiPortIndex(
  portNames: string[],
  prefer?: string,
): number {
  if (prefer) {
    const exact = portNames.findIndex((name) => name === prefer);
    if (exact >= 0) return exact;
    const needle = prefer.toLowerCase();
    const partial = portNames.findIndex((name) =>
      name.toLowerCase().includes(needle),
    );
    if (partial >= 0) return partial;
  }

  for (const hint of RODECASTER_MIDI_PORT_HINTS) {
    const needle = hint.toLowerCase();
    const index = portNames.findIndex((name) =>
      name.toLowerCase().includes(needle),
    );
    if (index >= 0) return index;
  }

  return -1;
}

/** Encode a Control Change as a raw MIDI message (3 bytes). */
export function encodeControlChange(message: {
  channel: number;
  controller: number;
  value: number;
}): number[] {
  const channel = Math.min(16, Math.max(1, message.channel));
  return [
    0xb0 | (channel - 1),
    message.controller & 0x7f,
    message.value & 0x7f,
  ];
}

/** Decode a raw MIDI message into a Control Change, if applicable. */
export function decodeControlChange(
  bytes: number[] | Uint8Array,
): { channel: number; controller: number; value: number } | undefined {
  if (bytes.length < 3) return undefined;
  const status = bytes[0]!;
  if ((status & 0xf0) !== 0xb0) return undefined;
  return {
    channel: (status & 0x0f) + 1,
    controller: bytes[1]! & 0x7f,
    value: bytes[2]! & 0x7f,
  };
}
