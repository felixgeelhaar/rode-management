import { describe, expect, it } from "vitest";
import { CapabilityCore, createBinding } from "@rode-control/core";
import { RodecasterDuoMidiAdapter } from "./midi-adapter.js";
import { RODECASTER_MIDI_SUPPORT, muteAddress } from "./midi-map.js";
import { MockMidiTransport } from "./midi-transport.js";

describe("RodecasterDuoMidiAdapter", () => {
  it("advertises Tier B official-MIDI support limits honestly", () => {
    expect(RODECASTER_MIDI_SUPPORT.tier).toBe("B");
    expect(RODECASTER_MIDI_SUPPORT.supported).toContain("Mute");
    expect(RODECASTER_MIDI_SUPPORT.unsupported).toContain("Gain");
    expect(RODECASTER_MIDI_SUPPORT.unsupported).toContain("Level");
  });

  it("mutes channel 1 over MIDI and reflects physical mute presses", async () => {
    const transport = new MockMidiTransport("test", false);
    const adapter = new RodecasterDuoMidiAdapter({ transport });
    const core = new CapabilityCore();
    core.registerAdapter(adapter);
    await core.start();

    core.upsertBinding(
      createBinding("mic-mute", "MIC MUTE", "Mute", {
        sourceHint: "PodMic",
      }),
    );

    const muted = await core.execute({
      type: "SetMute",
      bindingId: "mic-mute",
      value: true,
    });
    expect(muted.ok).toBe(true);
    expect(muted.state?.value).toBe(true);

    const address = muteAddress(0);
    expect(transport.sent).toContainEqual(
      expect.objectContaining({
        channel: address.channel,
        controller: address.controller,
        value: 1,
      }),
    );

    adapter.simulatePhysicalMute(0, false);
    expect(core.getControlSurface("mic-mute").valueText).toMatch(/off/i);
  });

  it("rejects level/gain writes as unsupported over official MIDI", async () => {
    const adapter = new RodecasterDuoMidiAdapter();
    const core = new CapabilityCore();
    core.registerAdapter(adapter);
    await core.start();

    core.upsertBinding(
      createBinding("game-level", "GAME", "Level", { sourceHint: "Game" }),
    );

    // No Level capability is published by the MIDI adapter — Tier B honesty.
    expect(core.resolveBinding("game-level")).toBeUndefined();
    expect(core.getControlSurface("game-level")).toEqual({
      label: "GAME",
      valueText: "N/A",
      availability: "unsupported",
    });
  });

  it("triggers SMART pads and toggles record over MIDI", async () => {
    const transport = new MockMidiTransport("test", false);
    const adapter = new RodecasterDuoMidiAdapter({ transport });
    const core = new CapabilityCore();
    core.registerAdapter(adapter);
    await core.start();

    core.upsertBinding(createBinding("pad-1", "SMART Pad 1", "PadTrigger"));
    core.upsertBinding(createBinding("record", "REC", "Recording"));

    const pad = await core.execute({ type: "TriggerPad", bindingId: "pad-1" });
    expect(pad.ok).toBe(true);
    expect(
      transport.sent.some((m) => m.controller === 35 && m.channel === 1),
    ).toBe(true);

    const rec = await core.execute({
      type: "StartRecording",
      bindingId: "record",
    });
    expect(rec.ok).toBe(true);
    expect(
      transport.sent.some((m) => m.controller === 17 && m.value === 1),
    ).toBe(true);
  });

  it("keeps mute bindings across MIDI disconnect/reconnect", async () => {
    const adapter = new RodecasterDuoMidiAdapter();
    const core = new CapabilityCore();
    core.registerAdapter(adapter);
    await core.start();
    core.upsertBinding(
      createBinding("mic-mute", "MIC MUTE", "Mute", { sourceHint: "PodMic" }),
    );

    adapter.simulateDisconnect();
    expect(core.getControlSurface("mic-mute").valueText).toBe("OFFLINE");
    expect(core.getBinding("mic-mute")).toBeDefined();

    adapter.simulateReconnect();
    const result = await core.execute({
      type: "ToggleMute",
      bindingId: "mic-mute",
    });
    expect(result.ok).toBe(true);
  });
});
