import {
  action,
  DidReceiveSettingsEvent,
  KeyDownEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";
import { BindingFeedbackSession } from "../binding-feedback.js";
import { GAME_LISTEN_BINDING_ID, getCapabilityCore } from "../core-host.js";

type ListenSettings = {
  bindingId?: string;
};

/**
 * Key action: toggle Listen/solo on a channel (official MIDI Tier B).
 */
@action({ UUID: "com.felixgeelhaar.rode-control.listen-toggle" })
export class ListenToggleKeyAction extends SingletonAction<ListenSettings> {
  private readonly feedback = new BindingFeedbackSession();

  override async onWillAppear(
    ev: WillAppearEvent<ListenSettings>,
  ): Promise<void> {
    const bindingId = ev.payload.settings.bindingId ?? GAME_LISTEN_BINDING_ID;
    await this.feedback.attach({
      actionId: ev.action.id,
      bindingId,
      action: ev.action,
      render: (action, id) => this.render(action, id),
    });
  }

  override async onDidReceiveSettings(
    ev: DidReceiveSettingsEvent<ListenSettings>,
  ): Promise<void> {
    await this.feedback.onDidReceiveSettings(ev, {
      defaultBindingId: GAME_LISTEN_BINDING_ID,
      render: (action, id) => this.render(action, id),
    });
  }

  override async onWillDisappear(
    ev: WillDisappearEvent<ListenSettings>,
  ): Promise<void> {
    this.feedback.onWillDisappear(ev);
  }

  override async onKeyDown(ev: KeyDownEvent<ListenSettings>): Promise<void> {
    const core = await getCapabilityCore();
    const bindingId = ev.payload.settings.bindingId ?? GAME_LISTEN_BINDING_ID;
    const result = await core.execute({ type: "ToggleListen", bindingId });
    if (!result.ok) {
      await ev.action.setTitle(result.error ?? "ERR");
      return;
    }
    await this.render(ev.action, bindingId);
  }

  private async render(
    actionRef: WillAppearEvent<ListenSettings>["action"],
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
    const listening = surface.valueText.toUpperCase() === "ON";
    await actionRef.setTitle(listening ? "LISTEN ●" : surface.label);
  }
}
