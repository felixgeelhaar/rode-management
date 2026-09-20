import {
  action,
  KeyDownEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";
import { getCapabilityCore, MIC_MUTE_BINDING_ID } from "../core-host.js";

type MuteSettings = {
  bindingId?: string;
};

/**
 * Key action: toggle mute on a logical binding (Tier B MIDI or any Mute capability).
 */
@action({ UUID: "com.felixgeelhaar.rode-control.mute-toggle" })
export class MuteToggleKeyAction extends SingletonAction<MuteSettings> {
  private readonly feedbackUnsubscribers = new Map<string, () => void>();

  override async onWillAppear(ev: WillAppearEvent<MuteSettings>): Promise<void> {
    const bindingId = ev.payload.settings.bindingId ?? MIC_MUTE_BINDING_ID;
    this.feedbackUnsubscribers.get(ev.action.id)?.();

    const core = await getCapabilityCore();
    const unsubscribe = core.subscribe((event) => {
      if (
        (event.type === "state-changed" &&
          event.resolved.binding.id === bindingId) ||
        (event.type === "binding-offline" && event.bindingId === bindingId) ||
        (event.type === "binding-online" && event.bindingId === bindingId)
      ) {
        void this.render(ev.action, bindingId);
      }
    });

    this.feedbackUnsubscribers.set(ev.action.id, unsubscribe);
    await this.render(ev.action, bindingId);
  }

  override async onWillDisappear(
    ev: WillDisappearEvent<MuteSettings>,
  ): Promise<void> {
    this.feedbackUnsubscribers.get(ev.action.id)?.();
    this.feedbackUnsubscribers.delete(ev.action.id);
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
