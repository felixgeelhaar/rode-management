import {
  action,
  DidReceiveSettingsEvent,
  KeyDownEvent,
  PropertyInspectorDidAppearEvent,
  SendToPluginEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject, JsonValue } from "@elgato/utils";
import { ACTION_UUIDS } from "../action-uuids.js";
import { BindingFeedbackSession } from "../binding-feedback.js";
import { getCapabilityCore, MIC_MUTE_BINDING_ID } from "../core-host.js";
import {
  handlePropertyInspectorDidAppear,
  handleSendToPlugin,
} from "../pi-bridge.js";

type MuteSettings = {
  bindingId?: string;
};

@action({ UUID: ACTION_UUIDS.muteToggle })
export class MuteToggleKeyAction extends SingletonAction<MuteSettings> {
  private readonly feedback = new BindingFeedbackSession();

  override async onWillAppear(ev: WillAppearEvent<MuteSettings>): Promise<void> {
    const bindingId = ev.payload.settings.bindingId ?? MIC_MUTE_BINDING_ID;
    await this.feedback.attach({
      actionId: ev.action.id,
      bindingId,
      action: ev.action,
      render: (action, id) => this.render(action, id),
    });
  }

  override async onDidReceiveSettings(
    ev: DidReceiveSettingsEvent<MuteSettings>,
  ): Promise<void> {
    await this.feedback.onDidReceiveSettings(ev, {
      defaultBindingId: MIC_MUTE_BINDING_ID,
      render: (action, id) => this.render(action, id),
    });
  }

  override async onPropertyInspectorDidAppear(
    ev: PropertyInspectorDidAppearEvent<MuteSettings>,
  ): Promise<void> {
    await handlePropertyInspectorDidAppear(ev, ACTION_UUIDS.muteToggle);
  }

  override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, JsonObject>): Promise<void> {
    await handleSendToPlugin(ev.payload, ACTION_UUIDS.muteToggle);
  }

  override async onWillDisappear(
    ev: WillDisappearEvent<MuteSettings>,
  ): Promise<void> {
    this.feedback.onWillDisappear(ev);
  }

  override async onKeyDown(ev: KeyDownEvent<MuteSettings>): Promise<void> {
    const core = await getCapabilityCore();
    const bindingId = ev.payload.settings.bindingId ?? MIC_MUTE_BINDING_ID;
    const result = await core.execute({ type: "ToggleMute", bindingId });
    if (!result.ok) {
      await ev.action.setTitle(result.error ?? "ERR");
      return;
    }
    await this.render(ev.action, bindingId);
  }

  private async render(
    actionRef: WillAppearEvent<MuteSettings>["action"],
    bindingId: string,
  ): Promise<void> {
    const core = await getCapabilityCore();
    const surface = core.getControlSurface(bindingId);
    if (surface.availability === "offline") {
      await actionRef.setTitle("OFFLINE");
      return;
    }
    if (surface.availability === "unsupported") {
      await actionRef.setTitle("N/A");
      return;
    }
    const muted = surface.valueText.toUpperCase() === "ON";
    await actionRef.setTitle(muted ? "MUTED" : surface.label);
  }
}
