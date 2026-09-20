import { readFile, writeFile } from "node:fs/promises";
import type { CapabilityCore } from "@rode-control/core";
import {
  CapabilityCore as Core,
  createBinding,
  createMicGainBinding,
  parseWorkflowProfiles,
  suggestCreatorBindings,
} from "@rode-control/core";
import { PodMicUsbSimAdapter } from "@rode-control/adapter-podmic-usb";
import {
  RodecasterDuoMidiAdapter,
  RodecasterDuoSimAdapter,
} from "@rode-control/adapter-rodecaster-duo";
import { builtInWorkflows } from "./workflows.js";

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
  /**
   * Load workflow JSON (one profile, array, or `{ workflows: [...] }`).
   * Merged after built-ins so file entries override matching ids.
   */
  workflowsPath?: string;
  /** When set, write the workflow bundle after capture/upsert (debounced). */
  workflowsAutosavePath?: string;
  dialCoalesceMs?: number;
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
 *   RODE_CONTROL_WORKFLOWS_PATH
 *   RODE_CONTROL_WORKFLOWS_AUTOSAVE
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
  const workflowsPath =
    options.workflowsPath ?? process.env.RODE_CONTROL_WORKFLOWS_PATH;
  const workflowsAutosavePath =
    options.workflowsAutosavePath ??
    process.env.RODE_CONTROL_WORKFLOWS_AUTOSAVE;

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

  if (bindingsPath) {
    const json = await readFile(bindingsPath, "utf8");
    core.importProfile(json, { replace: bindingsReplace });
  }

  for (const workflow of builtInWorkflows()) {
    core.upsertWorkflow(workflow);
  }

  if (workflowsPath) {
    const json = await readFile(workflowsPath, "utf8");
    for (const workflow of parseWorkflowProfiles(json)) {
      core.upsertWorkflow(workflow);
    }
  }

  if (autosavePath) {
    attachAutosave(core, autosavePath, mode);
  }

  if (workflowsAutosavePath) {
    attachWorkflowAutosave(core, workflowsAutosavePath);
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

function attachWorkflowAutosave(core: CapabilityCore, path: string): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void writeFile(path, core.exportWorkflowsJson(), "utf8");
    }, 250);
  };
  core.subscribe((event) => {
    if (event.type === "workflow-changed") {
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
