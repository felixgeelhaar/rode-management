import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createCapabilityCore,
  describeMidiRuntime,
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
    expect(device?.metadata?.midiTransport).toMatch(/Mock/i);
    expect(device?.metadata?.midiPulseToggle).toBe(false);
    expect(describeMidiRuntime({ midiHardware: false }).intent).toBe("mock");
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
    await core.stop();
    const saved = JSON.parse(await readFile(path, "utf8")) as {
      bindings: Array<{ id: string }>;
    };
    expect(saved.bindings.some((b) => b.id === "extra-mute")).toBe(true);
  });

  it("loads workflow overrides from disk after built-ins", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rode-workflows-"));
    const path = join(dir, "workflows.json");
    await writeFile(
      path,
      JSON.stringify({
        version: 1,
        id: "streaming",
        label: "Streaming Custom",
        steps: [{ bindingId: "my-mic-gain", value: 55 }],
      }),
    );

    const core = await createCapabilityCore({
      mode: "rodecaster",
      workflowsPath: path,
    });
    expect(core.getWorkflow("streaming")?.label).toBe("Streaming Custom");
    expect(core.getWorkflow("podcast")?.id).toBe("podcast");
    await core.stop();
  });

  it("autosaves workflow bundle after capture", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rode-wf-auto-"));
    const path = join(dir, "workflows.json");
    const core = await createCapabilityCore({
      mode: "rodecaster",
      workflowsAutosavePath: path,
    });
    core.captureWorkflow("custom", "Custom");
    await core.stop();
    const saved = JSON.parse(await readFile(path, "utf8")) as {
      workflows: Array<{ id: string }>;
    };
    expect(saved.workflows.some((w) => w.id === "custom")).toBe(true);
    expect(saved.workflows.some((w) => w.id === "streaming")).toBe(true);
  });
});
