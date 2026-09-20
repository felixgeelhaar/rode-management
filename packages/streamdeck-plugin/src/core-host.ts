import type { CapabilityCore } from "@rode-control/core";
import {
  CapabilityCore as Core,
  createBinding,
  createMicGainBinding,
  suggestCreatorBindings,
} from "@rode-control/core";
import { PodMicUsbSimAdapter } from "@rode-control/adapter-podmic-usb";
import {
  RodecasterDuoMidiAdapter,
  RodecasterDuoSimAdapter,
} from "@rode-control/adapter-rodecaster-duo";

export const MIC_GAIN_BINDING_ID = "my-mic-gain";
export const MIC_MONITOR_BINDING_ID = "my-mic-monitor";
export const MIC_HPF_BINDING_ID = "my-mic-hpf";
export const MIC_COMP_BINDING_ID = "my-mic-comp";
export const GAME_LEVEL_BINDING_ID = "game-level";
export const CHAT_LEVEL_BINDING_ID = "chat-level";
export const MUSIC_LEVEL_BINDING_ID = "music-level";
export const MIC_MUTE_BINDING_ID = "mic-mute";
export const GAME_LISTEN_BINDING_ID = "game-listen";
export const PAD_1_BINDING_ID = "pad-1";
export const RECORD_BINDING_ID = "record";

let corePromise: Promise<CapabilityCore> | undefined;

/**
 * Hosts the capability core inside the Stream Deck plugin process.
 *
 * RODE_CONTROL_ADAPTER:
 *   sim              — PodMic USB simulator (default, Phase 1–2)
 *   rodecaster       — RØDECaster Duo simulator (Phase 3 mix bank)
 *   rodecaster-midi  — Official Duo/Pro II MIDI surface (Tier B; mock transport)
 *   topology         — PodMic USB sim + Duo sim together (mixer-preferred Gain)
 *   none             — no adapters (bindings stay offline)
 */
export async function getCapabilityCore(): Promise<CapabilityCore> {
  if (!corePromise) {
    corePromise = bootstrapCore();
  }
  return corePromise;
}

async function bootstrapCore(): Promise<CapabilityCore> {
  const core = new Core({ preferMixerOwnership: true });
  const mode = process.env.RODE_CONTROL_ADAPTER ?? "sim";

  if (mode === "sim") {
    core.registerAdapter(
      new PodMicUsbSimAdapter({
        initialGainDb: 24,
        initialMonitorPercent: 65,
      }),
    );
  } else if (mode === "rodecaster") {
    core.registerAdapter(new RodecasterDuoSimAdapter());
  } else if (mode === "rodecaster-midi") {
    core.registerAdapter(new RodecasterDuoMidiAdapter());
  } else if (mode === "topology") {
    core.registerAdapter(
      new PodMicUsbSimAdapter({
        initialGainDb: 24,
        initialMonitorPercent: 65,
      }),
    );
    core.registerAdapter(new RodecasterDuoSimAdapter());
  }

  await core.start();

  if (mode === "topology") {
    seedTopology(core);
  } else if (mode === "rodecaster") {
    seedRodecasterBindings(core);
  } else if (mode === "rodecaster-midi") {
    seedRodecasterMidiBindings(core);
  } else if (mode !== "none") {
    seedPodMicBindings(core);
  }

  return core;
}

function seedTopology(core: CapabilityCore): void {
  const devices = core.listDevices();
  const usbMic = devices
    .find((d) => d.family === "digital-microphone")
    ?.endpoints.find((e) => e.kind === "microphone");
  const mixerInput = devices
    .find((d) => d.family === "rodecaster")
    ?.endpoints.find((e) => (e.source ?? "").toLowerCase().includes("podmic"));

  if (usbMic && mixerInput) {
    core.setTopology({
      edges: [{ from: usbMic.id, to: mixerInput.id, relation: "feeds" }],
    });
  }

  seedRodecasterBindings(core);
  seedMicProcessingBindings(core);
}

function seedPodMicBindings(core: CapabilityCore): void {
  core.upsertBinding(
    createMicGainBinding({
      id: MIC_GAIN_BINDING_ID,
      label: "MIC",
      sourceHint: "PodMic",
    }),
  );
  seedMicProcessingBindings(core);
}

function seedMicProcessingBindings(core: CapabilityCore): void {
  core.upsertBinding(
    createBinding(MIC_MONITOR_BINDING_ID, "MONITOR", "Monitoring", {
      sourceHint: "PodMic",
    }),
  );
  core.upsertBinding(
    createBinding(MIC_HPF_BINDING_ID, "HPF", "HighPassFilter", {
      sourceHint: "PodMic",
    }),
  );
  core.upsertBinding(
    createBinding(MIC_COMP_BINDING_ID, "COMP", "Compression", {
      sourceHint: "PodMic",
    }),
  );
}

function seedRodecasterBindings(core: CapabilityCore): void {
  const suggestions = suggestCreatorBindings(core.listDevices());
  for (const suggestion of suggestions.filter((s) => s.bank === "mix")) {
    core.upsertBinding(suggestion.binding);
  }

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

/**
 * Tier B MIDI: mute / listen / pads / record only.
 * Mic dial binding is Mute (press = toggle); rotate AdjustGain stays unsupported.
 */
function seedRodecasterMidiBindings(core: CapabilityCore): void {
  const suggestions = suggestCreatorBindings(core.listDevices());
  for (const suggestion of suggestions.filter(
    (s) => s.bank === "mic" || s.bank === "production",
  )) {
    core.upsertBinding(suggestion.binding);
  }

  core.upsertBinding(
    createBinding(MIC_GAIN_BINDING_ID, "MIC", "Mute", {
      sourceHint: "PodMic",
    }),
  );
  core.upsertBinding(
    createBinding(MIC_MUTE_BINDING_ID, "MIC MUTE", "Mute", {
      sourceHint: "PodMic",
    }),
  );
  core.upsertBinding(
    createBinding(GAME_LISTEN_BINDING_ID, "GAME LISTEN", "Listen", {
      sourceHint: "Game",
    }),
  );
  core.upsertBinding(createBinding(PAD_1_BINDING_ID, "SMART Pad 1", "PadTrigger"));
  core.upsertBinding(createBinding(RECORD_BINDING_ID, "REC", "Recording"));

  // Honest Tier B: Level bindings stay configured but surface as N/A.
  core.upsertBinding(
    createBinding(GAME_LEVEL_BINDING_ID, "GAME", "Level", {
      sourceHint: "Game",
    }),
  );
}
