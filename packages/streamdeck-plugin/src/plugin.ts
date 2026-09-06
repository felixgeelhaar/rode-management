import streamDeck from "@elgato/streamdeck";
import { ChannelLevelDialAction } from "./actions/channel-level.js";
import { MicGainDialAction } from "./actions/mic-gain.js";
import { getCapabilityCore } from "./core-host.js";

streamDeck.actions.registerAction(new MicGainDialAction());
streamDeck.actions.registerAction(new ChannelLevelDialAction());

// Warm the capability core so discovery begins with the plugin.
void getCapabilityCore().catch((err) => {
  streamDeck.logger.error("Failed to start capability core", err);
});

streamDeck.connect();
