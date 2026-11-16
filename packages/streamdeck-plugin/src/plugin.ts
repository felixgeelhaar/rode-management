import streamDeck from "@elgato/streamdeck";
import { ApplyWorkflowKeyAction } from "./actions/apply-workflow.js";
import { CaptureWorkflowKeyAction } from "./actions/capture-workflow.js";
import { ChannelLevelDialAction } from "./actions/channel-level.js";
import { ListenToggleKeyAction } from "./actions/listen-toggle.js";
import { MicGainDialAction } from "./actions/mic-gain.js";
import { MicMonitorDialAction } from "./actions/mic-monitor.js";
import { MuteToggleKeyAction } from "./actions/mute-toggle.js";
import { PadTriggerKeyAction } from "./actions/pad-trigger.js";
import {
  CompressorToggleKeyAction,
  HpfToggleKeyAction,
} from "./actions/processing-toggle.js";
import { RecordToggleKeyAction } from "./actions/record-toggle.js";
import { getCapabilityCore } from "./core-host.js";

streamDeck.actions.registerAction(new MicGainDialAction());
streamDeck.actions.registerAction(new MicMonitorDialAction());
streamDeck.actions.registerAction(new ChannelLevelDialAction());
streamDeck.actions.registerAction(new MuteToggleKeyAction());
streamDeck.actions.registerAction(new ListenToggleKeyAction());
streamDeck.actions.registerAction(new HpfToggleKeyAction());
streamDeck.actions.registerAction(new CompressorToggleKeyAction());
streamDeck.actions.registerAction(new PadTriggerKeyAction());
streamDeck.actions.registerAction(new RecordToggleKeyAction());
streamDeck.actions.registerAction(new ApplyWorkflowKeyAction());
streamDeck.actions.registerAction(new CaptureWorkflowKeyAction());

// Warm the capability core so discovery begins with the plugin.
void getCapabilityCore().catch((err) => {
  streamDeck.logger.error("Failed to start capability core", err);
});

streamDeck.connect();
