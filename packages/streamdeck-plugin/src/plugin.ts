import streamDeck from "@elgato/streamdeck";
import { ChannelLevelDialAction } from "./actions/channel-level.js";
import { ListenToggleKeyAction } from "./actions/listen-toggle.js";
import { MicGainDialAction } from "./actions/mic-gain.js";
import { MuteToggleKeyAction } from "./actions/mute-toggle.js";
import { PadTriggerKeyAction } from "./actions/pad-trigger.js";
import { RecordToggleKeyAction } from "./actions/record-toggle.js";
import { getCapabilityCore } from "./core-host.js";

streamDeck.actions.registerAction(new MicGainDialAction());
streamDeck.actions.registerAction(new ChannelLevelDialAction());
streamDeck.actions.registerAction(new MuteToggleKeyAction());
streamDeck.actions.registerAction(new ListenToggleKeyAction());
streamDeck.actions.registerAction(new PadTriggerKeyAction());
streamDeck.actions.registerAction(new RecordToggleKeyAction());

// Warm the capability core so discovery begins with the plugin.
void getCapabilityCore().catch((err) => {
  streamDeck.logger.error("Failed to start capability core", err);
});

streamDeck.connect();
