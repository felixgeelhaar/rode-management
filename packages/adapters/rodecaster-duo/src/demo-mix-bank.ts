/**
 * Phase 3 demo: Mix bank over RØDECaster Duo simulator.
 *
 * Stream Deck semantics stay MIC / GAME / CHAT / MUSIC even though
 * mic gain is owned by the mixer input channel, not the USB microphone.
 */

import {
  CapabilityCore,
  createBinding,
  createMicGainBinding,
  suggestCreatorBindings,
} from "@rode-control/core";
import { RodecasterDuoSimAdapter } from "./sim-adapter.js";

async function main(): Promise<void> {
  const adapter = new RodecasterDuoSimAdapter();
  const core = new CapabilityCore();
  core.registerAdapter(adapter);
  await core.start();

  core.upsertBinding(
    createMicGainBinding({ label: "MIC", sourceHint: "PodMic" }),
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
  core.upsertBinding(
    createBinding("headphones-level", "HP", "Level", {
      sourceHint: "Headphones",
    }),
  );

  console.log("Suggested banks:");
  for (const suggestion of suggestCreatorBindings(core.listDevices())) {
    console.log(
      `  [${suggestion.bank}] ${suggestion.binding.label} → ${suggestion.binding.capabilityType} (${suggestion.role})`,
    );
  }

  console.log("Mix surface:");
  for (const id of [
    "my-mic-gain",
    "game-level",
    "chat-level",
    "music-level",
    "headphones-level",
  ]) {
    console.log(" ", core.getControlSurface(id));
  }

  console.log("Adjust GAME +3 dB:");
  await core.execute({ type: "AdjustLevel", bindingId: "game-level", delta: 3 });
  console.log(" ", core.getControlSurface("game-level"));

  console.log("Headphones +5:");
  await core.execute({
    type: "AdjustLevel",
    bindingId: "headphones-level",
    delta: 5,
  });
  console.log(" ", core.getControlSurface("headphones-level"));

  console.log("Mute MIC via gain binding press:");
  const muteResult = await core.execute({
    type: "ToggleMute",
    bindingId: "my-mic-gain",
  });
  console.log("  retargeted capability:", muteResult.resolved?.capability.type);
  console.log("  mute state:", muteResult.state?.value);
  console.log("  sibling mute:", core.getSiblingState("my-mic-gain", "Mute")?.value);

  await core.stop();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
