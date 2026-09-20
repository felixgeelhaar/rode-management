import {
  action,
  KeyDownEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";
import { GAME_LISTEN_BINDING_ID, getCapabilityCore } from "../core-host.js";

type ListenSettings = {
  bindingId?: string;
};

/**
 * Key action: toggle Listen/solo on a channel (official MIDI Tier B).
 */
@action({ UUID: "com.felixgeelhaar.rode-control.listen-toggle" })
export class ListenToggleKeyAction extends SingletonAction<ListenSettings> {
  private readonly feedbackUnsubscribers = new Map<string, () => void>();

  override async onWillAppear(
    ev: WillAppearEvent<ListenSettings>,
  ): Promise<void> {
    const bindingId = ev.payload.settings.bindingId ?? GAME_LISTEN_BINDING_ID;
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
    ev: WillDisappearEvent<ListenSettings>,
  ): Promise<void> {
    this.feedbackUnsubscribers.get(ev.action.id)?.();
    this.feedbackUnsubscribers.delete(ev.action.id);
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
