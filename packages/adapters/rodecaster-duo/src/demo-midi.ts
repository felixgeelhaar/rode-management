/**
 * Tier B demo: official RØDECaster MIDI surface (mocked transport).
 *
 * Proves mute / listen / pads / record without proprietary HID.
 * Levels and gain remain out of scope for this adapter.
 */

import {
  CapabilityCore,
  createBinding,
} from "@rode-control/core";
import { RodecasterDuoMidiAdapter } from "./midi-adapter.js";
import { RODECASTER_MIDI_SUPPORT } from "./midi-map.js";
import { MockMidiTransport } from "./midi-transport.js";

async function main(): Promise<void> {
  console.log("RØDECaster MIDI support:", RODECASTER_MIDI_SUPPORT);

  const transport = new MockMidiTransport("demo-mock", false);
  const adapter = new RodecasterDuoMidiAdapter({ transport });
  const core = new CapabilityCore();
  core.registerAdapter(adapter);
  await core.start();

  core.upsertBinding(
    createBinding("mic-mute", "MIC MUTE", "Mute", { sourceHint: "PodMic" }),
  );
  core.upsertBinding(
    createBinding("game-listen", "GAME LISTEN", "Listen", {
      sourceHint: "Game",
    }),
  );
  core.upsertBinding(createBinding("pad-1", "SMART Pad 1", "PadTrigger"));
  core.upsertBinding(createBinding("record", "REC", "Recording"));

  console.log("Surface:");
  for (const id of ["mic-mute", "game-listen", "pad-1", "record"]) {
    console.log(" ", core.getControlSurface(id));
  }

  console.log("Mute MIC:");
  await core.execute({ type: "SetMute", bindingId: "mic-mute", value: true });
  console.log(" ", core.getControlSurface("mic-mute"));
  console.log("  MIDI sent:", transport.sent.at(-1));

  console.log("Physical unmute from console:");
  adapter.simulatePhysicalMute(0, false);
  console.log(" ", core.getControlSurface("mic-mute"));

  console.log("Trigger PAD 1 + start REC:");
  await core.execute({ type: "TriggerPad", bindingId: "pad-1" });
  await core.execute({ type: "StartRecording", bindingId: "record" });
  console.log("  MIDI traffic:", transport.sent.slice(-2));

  await core.stop();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
