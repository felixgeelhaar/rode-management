import {
  action,
  KeyDownEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";
import { getCapabilityCore, PAD_1_BINDING_ID } from "../core-host.js";

type PadSettings = {
  bindingId?: string;
};

/**
 * Key action: fire a SMART Pad / PadTrigger binding (official MIDI Tier B).
 */
@action({ UUID: "com.felixgeelhaar.rode-control.pad-trigger" })
export class PadTriggerKeyAction extends SingletonAction<PadSettings> {
  private readonly feedbackUnsubscribers = new Map<string, () => void>();
  private readonly flashTimers = new Map<string, ReturnType<typeof setTimeout>>();

  override async onWillAppear(ev: WillAppearEvent<PadSettings>): Promise<void> {
    const bindingId = ev.payload.settings.bindingId ?? PAD_1_BINDING_ID;
    this.feedbackUnsubscribers.get(ev.action.id)?.();

    const core = await getCapabilityCore();
    const unsubscribe = core.subscribe((event) => {
      if (
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
    ev: WillDisappearEvent<PadSettings>,
  ): Promise<void> {
    this.clearFlash(ev.action.id);
    this.feedbackUnsubscribers.get(ev.action.id)?.();
    this.feedbackUnsubscribers.delete(ev.action.id);
  }

  override async onKeyDown(ev: KeyDownEvent<PadSettings>): Promise<void> {
    const core = await getCapabilityCore();
    const bindingId = ev.payload.settings.bindingId ?? PAD_1_BINDING_ID;
    const result = await core.execute({ type: "TriggerPad", bindingId });
    if (!result.ok) {
      await ev.action.setTitle(result.error ?? "ERR");
      return;
    }

    this.clearFlash(ev.action.id);
    await ev.action.setTitle("FIRE");
    this.flashTimers.set(
      ev.action.id,
      setTimeout(() => {
        this.flashTimers.delete(ev.action.id);
        void this.render(ev.action, bindingId);
      }, 250),
    );
  }

  private clearFlash(actionId: string): void {
    const timer = this.flashTimers.get(actionId);
    if (timer) {
      clearTimeout(timer);
      this.flashTimers.delete(actionId);
    }
  }

  private async render(
    actionRef: WillAppearEvent<PadSettings>["action"],
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
    await actionRef.setTitle(surface.label);
  }
}
