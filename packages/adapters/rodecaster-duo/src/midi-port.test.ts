import { describe, expect, it } from "vitest";
import {
  decodeControlChange,
  encodeControlChange,
  findMidiPortIndex,
} from "./midi-port.js";

describe("midi-port helpers", () => {
  it("finds ports by exact name, substring, then RØDE hints", () => {
    const names = ["Loopback", "RØDECaster Duo MIDI Function", "Other"];
    expect(findMidiPortIndex(names, "Loopback")).toBe(0);
    expect(findMidiPortIndex(names, "duo midi")).toBe(1);
    expect(findMidiPortIndex(names)).toBe(1);
    expect(findMidiPortIndex(["Speakers", "Mic"])).toBe(-1);
  });

  it("round-trips Control Change encoding", () => {
    const bytes = encodeControlChange({
      channel: 3,
      controller: 27,
      value: 1,
    });
    expect(bytes).toEqual([0xb2, 27, 1]);
    expect(decodeControlChange(bytes)).toEqual({
      channel: 3,
      controller: 27,
      value: 1,
    });
    expect(decodeControlChange([0x90, 60, 100])).toBeUndefined();
  });
});
