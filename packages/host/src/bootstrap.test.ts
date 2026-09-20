import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createCapabilityCore,
  GAME_LEVEL_BINDING_ID,
  MIC_GAIN_BINDING_ID,
  resetCapabilityCoreSingleton,
} from "./bootstrap.js";

afterEach(() => {
  resetCapabilityCoreSingleton();
});

describe("createCapabilityCore", () => {
  it("boots PodMic sim with gain + processing bindings", async () => {
    const core = await createCapabilityCore({ mode: "sim" });
    expect(core.listDevices()[0]?.model).toMatch(/PodMic/i);
    expect(core.getControlSurface(MIC_GAIN_BINDING_ID).availability).toBe(
      "available",
    );
    expect(core.getControlSurface("my-mic-monitor").valueText).toMatch(/%/);
    await core.stop();
  });

  it("boots MIDI mode with honest Level N/A", async () => {
    const core = await createCapabilityCore({ mode: "rodecaster-midi" });
    expect(core.getControlSurface("mic-mute").availability).toBe("available");
    expect(core.getControlSurface(GAME_LEVEL_BINDING_ID)).toEqual({
      label: "GAME",
      valueText: "N/A",
      availability: "unsupported",
    });
    await core.stop();
  });

  it("keeps mock MIDI when hardware is not requested", async () => {
    const core = await createCapabilityCore({
      mode: "rodecaster-midi",
      midiHardware: false,
    });
    const device = core.listDevices()[0];
    expect(device?.connection).toBe("midi");
    expect(device?.metadata?.controlSurface).toBe("official-midi");
    await core.stop();
  });

  it("prefers mixer Gain in topology mode", async () => {
    const core = await createCapabilityCore({ mode: "topology" });
    const resolved = core.resolveBinding(MIC_GAIN_BINDING_ID);
    expect(resolved?.device.family).toBe("rodecaster");
    expect(resolved?.endpoint.kind).toBe("channel");
    await core.stop();
  });

  it("merges a binding profile from disk", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rode-bindings-"));
    const path = join(dir, "layout.json");
    await writeFile(
      path,
      JSON.stringify({
        version: 1,
        exportedAt: new Date().toISOString(),
        bindings: [
          {
            id: "custom-chat",
            label: "CHAT CUSTOM",
            capabilityType: "Level",
            sourceHint: "Discord",
          },
        ],
      }),
    );

    const core = await createCapabilityCore({
      mode: "rodecaster",
      bindingsPath: path,
    });
    expect(core.getBinding("custom-chat")?.label).toBe("CHAT CUSTOM");
    expect(core.getControlSurface("custom-chat").availability).toBe("available");
    await core.stop();
  });

  it("autosaves binding profile after upsert events", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rode-autosave-"));
    const path = join(dir, "auto.json");
    const core = await createCapabilityCore({
      mode: "sim",
      bindingsAutosavePath: path,
    });
    core.upsertBinding({
      id: "extra-mute",
      label: "EXTRA",
      capabilityType: "Mute",
      sourceHint: "PodMic",
    });
    await new Promise((r) => setTimeout(r, 350));
    const saved = JSON.parse(await readFile(path, "utf8")) as {
      bindings: Array<{ id: string }>;
    };
    expect(saved.bindings.some((b) => b.id === "extra-mute")).toBe(true);
    await core.stop();
  });
});
