import { describe, expect, it } from "vitest";
import {
  CapabilityCore,
  createBinding,
  createMicGainBinding,
  suggestCreatorBindings,
} from "@rode-control/core";
import { RodecasterDuoSimAdapter } from "./sim-adapter.js";

describe("RodecasterDuoSimAdapter", () => {
  it("exposes mix channels and preserves My Mic gain ownership semantics", async () => {
    const adapter = new RodecasterDuoSimAdapter();
    const core = new CapabilityCore();
    core.registerAdapter(adapter);
    await core.start();

    core.upsertBinding(
      createMicGainBinding({
        label: "MIC",
        sourceHint: "PodMic",
      }),
    );
    core.upsertBinding(
      createBinding("game-level", "GAME", "Level", { sourceHint: "Game" }),
    );
    core.upsertBinding(
      createBinding("chat-level", "CHAT", "Level", { sourceHint: "Discord" }),
    );
    core.upsertBinding(
      createBinding("music-level", "MUSIC", "Level", { sourceHint: "Music" }),
    );

    const mic = core.resolveBinding("my-mic-gain");
    expect(mic?.endpoint.kind).toBe("channel");
    expect(mic?.endpoint.source).toBe("PodMic");
    expect(mic?.capability.type).toBe("Gain");
    expect(core.getControlSurface("my-mic-gain").label).toBe("MIC");

    await core.execute({
      type: "AdjustLevel",
      bindingId: "game-level",
      delta: 2,
    });
    expect(adapter.getChannelLevel("game")).toBe(-8);

    adapter.simulateExternalLevel("chat", -20);
    expect(core.getControlSurface("chat-level").valueText).toContain("-20");

    const suggestions = suggestCreatorBindings(core.listDevices());
    expect(
      suggestions.some((s) => s.bank === "mix" && s.binding.label === "MIC"),
    ).toBe(true);
    expect(suggestions.some((s) => s.binding.label === "GAME")).toBe(true);
  });

  it("toggles mute on the mic channel via same-endpoint retarget from gain binding", async () => {
    const adapter = new RodecasterDuoSimAdapter();
    const core = new CapabilityCore();
    core.registerAdapter(adapter);
    await core.start();
    core.upsertBinding(
      createMicGainBinding({
        label: "MIC",
        sourceHint: "PodMic",
      }),
    );

    const muted = await core.execute({
      type: "ToggleMute",
      bindingId: "my-mic-gain",
    });
    expect(muted.ok).toBe(true);
    expect(muted.state?.value).toBe(true);
    expect(muted.resolved?.capability.type).toBe("Mute");
  });

  it("survives disconnect without dropping mix bindings", async () => {
    const adapter = new RodecasterDuoSimAdapter();
    const core = new CapabilityCore();
    core.registerAdapter(adapter);
    await core.start();
    core.upsertBinding(
      createBinding("game-level", "GAME", "Level", { sourceHint: "Game" }),
    );

    adapter.simulateDisconnect();
    expect(core.getControlSurface("game-level").valueText).toBe("OFFLINE");
    expect(core.getBinding("game-level")).toBeDefined();

    adapter.simulateReconnect();
    const result = await core.execute({
      type: "SetLevel",
      bindingId: "game-level",
      value: -12,
    });
    expect(result.ok).toBe(true);
    expect(core.getControlSurface("game-level").valueText).toContain("-12");
  });
});
