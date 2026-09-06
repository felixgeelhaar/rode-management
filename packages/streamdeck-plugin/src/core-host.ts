import type { CapabilityCore } from "@rode-control/core";
import {
  CapabilityCore as Core,
  createBinding,
  createMicGainBinding,
  suggestCreatorBindings,
} from "@rode-control/core";
import { PodMicUsbSimAdapter } from "@rode-control/adapter-podmic-usb";
import { RodecasterDuoSimAdapter } from "@rode-control/adapter-rodecaster-duo";

export const MIC_GAIN_BINDING_ID = "my-mic-gain";
export const MIC_MONITOR_BINDING_ID = "my-mic-monitor";
export const GAME_LEVEL_BINDING_ID = "game-level";
export const CHAT_LEVEL_BINDING_ID = "chat-level";
export const MUSIC_LEVEL_BINDING_ID = "music-level";

let corePromise: Promise<CapabilityCore> | undefined;

/**
 * Hosts the capability core inside the Stream Deck plugin process.
 *
 * RODE_CONTROL_ADAPTER:
 *   sim          — PodMic USB simulator (default, Phase 1–2)
 *   rodecaster   — RØDECaster Duo simulator (Phase 3 mix bank)
 *   none         — no adapters (bindings stay offline)
 */
export async function getCapabilityCore(): Promise<CapabilityCore> {
  if (!corePromise) {
    corePromise = bootstrapCore();
  }
  return corePromise;
}

async function bootstrapCore(): Promise<CapabilityCore> {
  const core = new Core();
  const mode = process.env.RODE_CONTROL_ADAPTER ?? "sim";

  if (mode === "sim") {
    const adapter = new PodMicUsbSimAdapter({
      initialGainDb: 24,
      initialMonitorPercent: 65,
    });
    core.registerAdapter(adapter);
  } else if (mode === "rodecaster") {
    const adapter = new RodecasterDuoSimAdapter();
    core.registerAdapter(adapter);
  }

  await core.start();

  if (mode === "rodecaster") {
    seedRodecasterBindings(core);
  } else {
    seedPodMicBindings(core);
  }

  return core;
}

function seedPodMicBindings(core: CapabilityCore): void {
  core.upsertBinding(
    createMicGainBinding({
      id: MIC_GAIN_BINDING_ID,
      label: "MIC",
      sourceHint: "PodMic",
    }),
  );
  core.upsertBinding(
    createBinding(MIC_MONITOR_BINDING_ID, "MONITOR", "Monitoring", {
      sourceHint: "PodMic",
    }),
  );
}

function seedRodecasterBindings(core: CapabilityCore): void {
  const suggestions = suggestCreatorBindings(core.listDevices());
  for (const suggestion of suggestions.filter((s) => s.bank === "mix")) {
    core.upsertBinding(suggestion.binding);
  }

  // Ensure stable IDs expected by Stream Deck actions.
  core.upsertBinding(
    createMicGainBinding({
      id: MIC_GAIN_BINDING_ID,
      label: "MIC",
      sourceHint: "PodMic",
    }),
  );
  core.upsertBinding(
    createBinding(GAME_LEVEL_BINDING_ID, "GAME", "Level", {
      sourceHint: "Game",
    }),
  );
  core.upsertBinding(
    createBinding(CHAT_LEVEL_BINDING_ID, "CHAT", "Level", {
      sourceHint: "Discord",
    }),
  );
  core.upsertBinding(
    createBinding(MUSIC_LEVEL_BINDING_ID, "MUSIC", "Level", {
      sourceHint: "Music",
    }),
  );
}
