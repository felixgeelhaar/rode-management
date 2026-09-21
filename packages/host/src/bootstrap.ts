import { readFile, writeFile } from "node:fs/promises";
import type { CapabilityCore } from "@rode-control/core";
import {
  CapabilityCore as Core,
  createBinding,
  createMicGainBinding,
  suggestCreatorBindings,
} from "@rode-control/core";
import { PodMicUsbSimAdapter } from "@rode-control/adapter-podmic-usb";
import {
  createHardwareMidiTransport,
  RodecasterDuoMidiAdapter,
  RodecasterDuoSimAdapter,
  type RodecasterModel,
} from "@rode-control/adapter-rodecaster-duo";

export const MIC_GAIN_BINDING_ID = "my-mic-gain";
export const MIC_MONITOR_BINDING_ID = "my-mic-monitor";
export const MIC_HPF_BINDING_ID = "my-mic-hpf";
export const MIC_COMP_BINDING_ID = "my-mic-comp";
export const GAME_LEVEL_BINDING_ID = "game-level";
export const CHAT_LEVEL_BINDING_ID = "chat-level";
export const MUSIC_LEVEL_BINDING_ID = "music-level";
export const HEADPHONES_LEVEL_BINDING_ID = "headphones-level";
export const MIC_MUTE_BINDING_ID = "mic-mute";
export const GAME_LISTEN_BINDING_ID = "game-listen";
export const PAD_1_BINDING_ID = "pad-1";
export const RECORD_BINDING_ID = "record";

export type AdapterMode =
  | "sim"
  | "rodecaster"
  | "rodecaster-midi"
  | "topology"
  | "none";

export interface BootstrapOptions {
  mode?: AdapterMode;
  bindingsPath?: string;
  bindingsReplace?: boolean;
  /** When set, write the binding profile after binding changes (debounced). */
  bindingsAutosavePath?: string;
  dialCoalesceMs?: number;
  /**
   * Prefer a MIDI port by name/substring when using hardware MIDI.
   * Env: `RODE_CONTROL_MIDI_PORT`.
   */
  midiPort?: string;
  /**
   * Open OS MIDI instead of the mock transport.
   * Env: `RODE_CONTROL_MIDI_HARDWARE=1`, or implied when `midiPort` / `RODE_CONTROL_MIDI_PORT` is set.
   */
  midiHardware?: boolean;
  /** Open a virtual loopback when no hardware matches. Env: `RODE_CONTROL_MIDI_VIRTUAL=1`. */
  midiVirtual?: boolean;
  /** Duo (default) or Pro II channel/pad counts. Env: `RODE_CONTROL_MIDI_MODEL`. */
  midiModel?: RodecasterModel;
}

let corePromise: Promise<CapabilityCore> | undefined;

/**
 * Shared host bootstrap for Stream Deck, CLI, and tests.
 *
 * Env defaults (when options omit fields):
 *   RODE_CONTROL_ADAPTER
 *   RODE_CONTROL_BINDINGS_PATH
 *   RODE_CONTROL_BINDINGS_REPLACE=1
 *   RODE_CONTROL_BINDINGS_AUTOSAVE
 *   RODE_CONTROL_MIDI_PORT / RODE_CONTROL_MIDI_HARDWARE / RODE_CONTROL_MIDI_VIRTUAL / RODE_CONTROL_MIDI_MODEL
 */
export async function createCapabilityCore(
  options: BootstrapOptions = {},
): Promise<CapabilityCore> {
  const mode = (options.mode ??
    process.env.RODE_CONTROL_ADAPTER ??
    "sim") as AdapterMode;
  const bindingsPath =
    options.bindingsPath ?? process.env.RODE_CONTROL_BINDINGS_PATH;
  const bindingsReplace =
    options.bindingsReplace ??
    process.env.RODE_CONTROL_BINDINGS_REPLACE === "1";
  const autosavePath =
    options.bindingsAutosavePath ?? process.env.RODE_CONTROL_BINDINGS_AUTOSAVE;

  const core = new Core({
    preferMixerOwnership: true,
    ...(options.dialCoalesceMs !== undefined
      ? { dialCoalesceMs: options.dialCoalesceMs }
      : {}),
  });

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
    core.registerAdapter(await createRodecasterMidiAdapter(options));
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

  if (bindingsPath) {
    const json = await readFile(bindingsPath, "utf8");
    core.importProfile(json, { replace: bindingsReplace });
  }

  if (autosavePath) {
    attachAutosave(core, autosavePath, mode);
  }

  return core;
}

function attachAutosave(
  core: CapabilityCore,
  path: string,
  mode: AdapterMode,
): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void writeFile(path, core.exportProfileJson(mode), "utf8");
    }, 250);
  };
  core.subscribe((event) => {
    if (
      event.type === "binding-online" ||
      event.type === "binding-offline"
    ) {
      schedule();
    }
  });
}

/** Process-wide singleton used by the Stream Deck plugin. */
export async function getCapabilityCore(): Promise<CapabilityCore> {
  if (!corePromise) {
    corePromise = createCapabilityCore();
  }
  return corePromise;
}

/** Test helper — drop the singleton between cases. */
export function resetCapabilityCoreSingleton(): void {
  corePromise = undefined;
}

async function createRodecasterMidiAdapter(
  options: BootstrapOptions,
): Promise<RodecasterDuoMidiAdapter> {
  const midiPort =
    options.midiPort ?? process.env.RODE_CONTROL_MIDI_PORT ?? undefined;
  const midiHardware =
    options.midiHardware ??
    (process.env.RODE_CONTROL_MIDI_HARDWARE === "1" || Boolean(midiPort));
  const midiVirtual =
    options.midiVirtual ?? process.env.RODE_CONTROL_MIDI_VIRTUAL === "1";
  const midiModel = resolveMidiModel(
    options.midiModel ?? process.env.RODE_CONTROL_MIDI_MODEL,
  );

  if (!midiHardware) {
    return new RodecasterDuoMidiAdapter({ model: midiModel });
  }

  const transport = await createHardwareMidiTransport({
    ...(midiPort !== undefined ? { portName: midiPort } : {}),
    allowVirtual: midiVirtual,
  });
  return new RodecasterDuoMidiAdapter({
    transport,
    model: midiModel,
    // Official RØDE MIDI uses value-1 press pulses (not absolute 0/1).
    pulseToggle: true,
  });
}

function resolveMidiModel(raw: string | RodecasterModel | undefined): RodecasterModel {
  if (raw === "pro-ii" || raw === "proii" || raw === "pro2") {
    return "pro-ii";
  }
  return "duo";
}

export interface MidiRuntimeInfo {
  /** True when hardware (or virtual) MIDI was requested. */
  requested: boolean;
  port?: string;
  virtual: boolean;
  model: RodecasterModel;
  /** mock | hardware | virtual — inferred from env before open. */
  intent: "mock" | "hardware" | "virtual";
}

/** Inspect MIDI-related env / bootstrap options without opening a port. */
export function describeMidiRuntime(
  options: BootstrapOptions = {},
): MidiRuntimeInfo {
  const port =
    options.midiPort ?? process.env.RODE_CONTROL_MIDI_PORT ?? undefined;
  const hardware =
    options.midiHardware ??
    (process.env.RODE_CONTROL_MIDI_HARDWARE === "1" || Boolean(port));
  const virtual =
    options.midiVirtual ?? process.env.RODE_CONTROL_MIDI_VIRTUAL === "1";
  const model = resolveMidiModel(
    options.midiModel ?? process.env.RODE_CONTROL_MIDI_MODEL,
  );

  let intent: MidiRuntimeInfo["intent"] = "mock";
  if (hardware) {
    intent = virtual ? "virtual" : "hardware";
  }

  return {
    requested: hardware,
    ...(port !== undefined ? { port } : {}),
    virtual,
    model,
    intent,
  };
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
  for (const suggestion of suggestions.filter(
    (s) => s.bank === "mix" || s.bank === "outputs",
  )) {
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
  core.upsertBinding(
    createBinding(HEADPHONES_LEVEL_BINDING_ID, "HP", "Level", {
      sourceHint: "Headphones",
    }),
  );
}

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

  core.upsertBinding(
    createBinding(GAME_LEVEL_BINDING_ID, "GAME", "Level", {
      sourceHint: "Game",
    }),
  );
}
