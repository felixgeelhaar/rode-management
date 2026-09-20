import {
  action,
  DidReceiveSettingsEvent,
  KeyDownEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";
import { BindingFeedbackSession } from "../binding-feedback.js";
import { getCapabilityCore, MIC_MUTE_BINDING_ID } from "../core-host.js";

type MuteSettings = {
  bindingId?: string;
};

/**
 * Key action: toggle mute on a logical binding (Tier B MIDI or any Mute capability).
 */
@action({ UUID: "com.felixgeelhaar.rode-control.mute-toggle" })
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
