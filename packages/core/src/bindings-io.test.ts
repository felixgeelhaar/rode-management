import { describe, expect, it } from "vitest";
import {
  createBindingProfile,
  parseBindingProfile,
  serializeBindingProfile,
} from "./bindings-io.js";
import {
  CapabilityCore,
  createBinding,
  createMicGainBinding,
} from "./capability-core.js";

describe("binding profile I/O", () => {
  it("round-trips bindings and topology through JSON", () => {
    const profile = createBindingProfile(
      [
        createMicGainBinding({ label: "MIC", sourceHint: "PodMic" }),
        createBinding("game-level", "GAME", "Level", { sourceHint: "Game" }),
      ],
      {
        adapterHint: "topology",
        topology: {
          edges: [{ from: "mic", to: "input-1", relation: "feeds" }],
        },
        now: () => new Date("2026-09-20T00:00:00.000Z"),
      },
    );

    const json = serializeBindingProfile(profile);
    const parsed = parseBindingProfile(json);

    expect(parsed.version).toBe(1);
    expect(parsed.adapterHint).toBe("topology");
    expect(parsed.exportedAt).toBe("2026-09-20T00:00:00.000Z");
    expect(parsed.bindings).toHaveLength(2);
    expect(parsed.bindings[0]?.id).toBe("my-mic-gain");
    expect(parsed.topology?.edges).toEqual([
      { from: "mic", to: "input-1", relation: "feeds" },
    ]);
  });

  it("rejects unsupported versions", () => {
    expect(() =>
      parseBindingProfile(JSON.stringify({ version: 99, bindings: [] })),
    ).toThrow(/Unsupported binding profile version/);
  });

  it("imports a profile into CapabilityCore", async () => {
    const core = new CapabilityCore();
    await core.start();

    const json = serializeBindingProfile(
      createBindingProfile([
        createBinding("custom-mute", "CUSTOM MUTE", "Mute", {
          sourceHint: "PodMic",
        }),
      ]),
    );

    core.importProfile(json, { replace: true });
    expect(core.getBinding("custom-mute")?.label).toBe("CUSTOM MUTE");
    expect(core.exportProfile().bindings).toHaveLength(1);
  });
});
